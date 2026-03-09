package mcp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/camillebizeul/test3/backend/models"
)

// Client handles communication with an MCP server.
// Supports both "streamable-http" and "sse" transports.
type Client struct {
	serverURL  string
	apiKey     string
	transport  string // "streamable-http" or "sse"
	httpClient *http.Client
	sessionID  string
	tools      []models.MCPTool
	mu         sync.RWMutex
	nextID     atomic.Int64 // monotonically increasing JSON-RPC request ID

	// SSE transport state
	sseEndpoint string // The endpoint URL received from the SSE stream
	sseDone     chan struct{}
	sseResults  map[int]chan *jsonRPCResponse
	sseResultMu sync.Mutex
}

type jsonRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      int         `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

type jsonRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *jsonRPCError   `json:"error,omitempty"`
}

type jsonRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type initializeResult struct {
	ProtocolVersion string      `json:"protocolVersion"`
	Capabilities    interface{} `json:"capabilities"`
	ServerInfo      interface{} `json:"serverInfo"`
}

type listToolsResult struct {
	Tools      []toolInfo `json:"tools"`
	NextCursor string     `json:"nextCursor,omitempty"`
}

type toolInfo struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema interface{} `json:"inputSchema"`
}

type callToolResult struct {
	Content []toolContent `json:"content"`
}

type toolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// rpcID returns the next unique JSON-RPC request ID.
func (c *Client) rpcID() int {
	return int(c.nextID.Add(1))
}

func NewClient(serverURL, apiKey, transport string) *Client {
	if transport == "" {
		transport = "streamable-http"
	}
	return &Client{
		serverURL: serverURL,
		apiKey:    apiKey,
		transport: transport,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		sseResults: make(map[int]chan *jsonRPCResponse),
	}
}

// ──────────────────────────────────────────────
// Streamable HTTP transport
// ──────────────────────────────────────────────

func (c *Client) sendRPC(ctx context.Context, req jsonRPCRequest) (*jsonRPCResponse, error) {
	if c.transport == "sse" {
		return c.sendRPCViaSSE(ctx, req)
	}
	return c.sendRPCStreamableHTTP(ctx, req)
}

func (c *Client) sendRPCStreamableHTTP(ctx context.Context, req jsonRPCRequest) (*jsonRPCResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.serverURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json, text/event-stream")
	if c.sessionID != "" {
		httpReq.Header.Set("Mcp-Session-Id", c.sessionID)
	}
	if c.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	// Capture session ID from response
	if sid := resp.Header.Get("Mcp-Session-Id"); sid != "" {
		c.sessionID = sid
	}

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("MCP server returned status %d: %s", resp.StatusCode, string(respBody))
	}

	// The server may respond with application/json or text/event-stream.
	// Handle both content types.
	contentType := resp.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "text/event-stream") {
		return c.parseSSEResponse(resp.Body)
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var rpcResp jsonRPCResponse
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w (body: %s)", err, string(respBody))
	}

	if rpcResp.Error != nil {
		return nil, fmt.Errorf("MCP error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	return &rpcResp, nil
}

// parseSSEResponse reads a text/event-stream body and returns the first
// JSON-RPC response found in a "message" event's data field.
func (c *Client) parseSSEResponse(body io.Reader) (*jsonRPCResponse, error) {
	scanner := bufio.NewScanner(body)
	var eventType, eventData string

	for scanner.Scan() {
		line := scanner.Text()

		if line == "" {
			// Event boundary — dispatch
			if eventType == "message" && eventData != "" {
				var rpcResp jsonRPCResponse
				if err := json.Unmarshal([]byte(eventData), &rpcResp); err != nil {
					return nil, fmt.Errorf("unmarshal SSE response: %w (data: %s)", err, eventData)
				}
				if rpcResp.Error != nil {
					return nil, fmt.Errorf("MCP error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
				}
				// Capture session ID if present in the parsed response isn't applicable here,
				// but sessionID is already captured from HTTP headers above.
				return &rpcResp, nil
			}
			eventType = ""
			eventData = ""
			continue
		}

		if strings.HasPrefix(line, "event: ") {
			eventType = strings.TrimPrefix(line, "event: ")
		} else if strings.HasPrefix(line, "data: ") {
			eventData = strings.TrimPrefix(line, "data: ")
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read SSE stream: %w", err)
	}

	return nil, fmt.Errorf("SSE stream ended without a message event")
}

// ──────────────────────────────────────────────
// SSE transport
// ──────────────────────────────────────────────

// connectSSE establishes the SSE connection and waits for the endpoint event.
func (c *Client) connectSSE() error {
	sseURL := strings.TrimRight(c.serverURL, "/") + "/sse"

	req, err := http.NewRequest("GET", sseURL, nil)
	if err != nil {
		return fmt.Errorf("create SSE request: %w", err)
	}
	req.Header.Set("Accept", "text/event-stream")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	// Use a client without timeout for the long-lived SSE connection
	sseClient := &http.Client{}
	resp, err := sseClient.Do(req)
	if err != nil {
		return fmt.Errorf("SSE connect: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return fmt.Errorf("SSE server returned status %d: %s", resp.StatusCode, string(respBody))
	}

	c.sseDone = make(chan struct{})
	endpointCh := make(chan string, 1)

	// Read SSE events in background
	go func() {
		defer resp.Body.Close()
		defer close(c.sseDone)

		scanner := bufio.NewScanner(resp.Body)
		var eventType, eventData string

		for scanner.Scan() {
			line := scanner.Text()

			if line == "" {
				// Empty line = event boundary, dispatch event
				if eventType == "endpoint" && eventData != "" {
					// Resolve the endpoint URL relative to the server URL.
					base, err := url.Parse(c.serverURL)
					endpoint := eventData
					if err == nil {
						ref, err := url.Parse(eventData)
						if err == nil {
							endpoint = base.ResolveReference(ref).String()
						}
					}
					select {
					case endpointCh <- endpoint:
					default:
					}
				} else if eventType == "message" && eventData != "" {
					// JSON-RPC response
					var rpcResp jsonRPCResponse
					if err := json.Unmarshal([]byte(eventData), &rpcResp); err == nil {
						c.sseResultMu.Lock()
						if ch, ok := c.sseResults[rpcResp.ID]; ok {
							ch <- &rpcResp
							delete(c.sseResults, rpcResp.ID)
						}
						c.sseResultMu.Unlock()
					}
				}
				eventType = ""
				eventData = ""
				continue
			}

			if strings.HasPrefix(line, "event: ") {
				eventType = strings.TrimPrefix(line, "event: ")
			} else if strings.HasPrefix(line, "data: ") {
				eventData = strings.TrimPrefix(line, "data: ")
			}
		}
	}()

	// Wait for endpoint event with timeout
	select {
	case endpoint := <-endpointCh:
		c.sseEndpoint = endpoint
		return nil
	case <-time.After(10 * time.Second):
		return fmt.Errorf("timeout waiting for SSE endpoint event")
	}
}

func (c *Client) sendRPCViaSSE(ctx context.Context, req jsonRPCRequest) (*jsonRPCResponse, error) {
	if c.sseEndpoint == "" {
		return nil, fmt.Errorf("SSE not connected: no endpoint available")
	}

	// Register a channel for this request ID
	resultCh := make(chan *jsonRPCResponse, 1)
	c.sseResultMu.Lock()
	c.sseResults[req.ID] = resultCh
	c.sseResultMu.Unlock()

	// POST the JSON-RPC request to the endpoint
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.sseEndpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		c.sseResultMu.Lock()
		delete(c.sseResults, req.ID)
		c.sseResultMu.Unlock()
		return nil, fmt.Errorf("send request: %w", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusNoContent {
		c.sseResultMu.Lock()
		delete(c.sseResults, req.ID)
		c.sseResultMu.Unlock()
		return nil, fmt.Errorf("SSE POST returned status %d", resp.StatusCode)
	}

	// Wait for response on SSE stream
	select {
	case rpcResp := <-resultCh:
		if rpcResp.Error != nil {
			return nil, fmt.Errorf("MCP error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
		}
		return rpcResp, nil
	case <-time.After(30 * time.Second):
		c.sseResultMu.Lock()
		delete(c.sseResults, req.ID)
		c.sseResultMu.Unlock()
		return nil, fmt.Errorf("timeout waiting for SSE response")
	}
}

// ──────────────────────────────────────────────
// Connect / Tools / CallTool (transport-agnostic)
// ──────────────────────────────────────────────

// Connect initializes the MCP session and loads available tools.
func (c *Client) Connect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// For SSE transport, first establish the SSE connection
	if c.transport == "sse" {
		if err := c.connectSSE(); err != nil {
			return fmt.Errorf("SSE connect: %w", err)
		}
	}

	// Initialize
	initReq := jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      c.rpcID(),
		Method:  "initialize",
		Params: map[string]interface{}{
			"protocolVersion": "2025-03-26",
			"capabilities":    map[string]interface{}{},
			"clientInfo": map[string]interface{}{
				"name":    "chat-ui",
				"version": "0.1.0",
			},
		},
	}

	resp, err := c.sendRPC(context.Background(), initReq)
	if err != nil {
		return fmt.Errorf("initialize: %w", err)
	}

	var initResult initializeResult
	if err := json.Unmarshal(resp.Result, &initResult); err != nil {
		return fmt.Errorf("parse initialize result: %w", err)
	}

	// Send initialized notification (no ID = notification)
	notifBody, _ := json.Marshal(map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "notifications/initialized",
	})

	notifURL := c.serverURL
	if c.transport == "sse" && c.sseEndpoint != "" {
		notifURL = c.sseEndpoint
	}

	httpReq, _ := http.NewRequest("POST", notifURL, bytes.NewReader(notifBody))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json, text/event-stream")
	if c.sessionID != "" {
		httpReq.Header.Set("Mcp-Session-Id", c.sessionID)
	}
	if c.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	nResp, err := c.httpClient.Do(httpReq)
	if err == nil {
		nResp.Body.Close()
	}

	// List tools
	var allTools []models.MCPTool
	cursor := ""
	for {
		params := map[string]interface{}{}
		if cursor != "" {
			params["cursor"] = cursor
		}
		toolsReq := jsonRPCRequest{
			JSONRPC: "2.0",
			ID:      c.rpcID(),
			Method:  "tools/list",
			Params:  params,
		}

		toolsResp, err := c.sendRPC(context.Background(), toolsReq)
		if err != nil {
			return fmt.Errorf("list tools: %w", err)
		}

		var result listToolsResult
		if err := json.Unmarshal(toolsResp.Result, &result); err != nil {
			return fmt.Errorf("parse tools: %w", err)
		}

		for _, t := range result.Tools {
			allTools = append(allTools, models.MCPTool{
				Name:        t.Name,
				Description: t.Description,
				InputSchema: t.InputSchema,
			})
		}

		if result.NextCursor == "" {
			break
		}
		cursor = result.NextCursor
	}

	c.tools = allTools
	return nil
}

// Tools returns the list of discovered tools.
func (c *Client) Tools() []models.MCPTool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.tools
}

// CallTool invokes a tool on the MCP server and returns the text result.
func (c *Client) CallTool(ctx context.Context, name string, arguments map[string]interface{}) (string, error) {
	req := jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      c.rpcID(),
		Method:  "tools/call",
		Params: map[string]interface{}{
			"name":      name,
			"arguments": arguments,
		},
	}

	resp, err := c.sendRPC(ctx, req)
	if err != nil {
		return "", fmt.Errorf("call tool %s: %w", name, err)
	}

	var result callToolResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return "", fmt.Errorf("parse tool result: %w", err)
	}

	var parts []string
	for _, c := range result.Content {
		if c.Text != "" {
			parts = append(parts, c.Text)
		}
	}
	if len(parts) == 0 {
		return "No result", nil
	}

	text := ""
	for i, p := range parts {
		if i > 0 {
			text += "\n"
		}
		text += p
	}
	return text, nil
}
