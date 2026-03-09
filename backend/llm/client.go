package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	mcpclient "github.com/camillebizeul/test3/backend/mcp"
	"github.com/camillebizeul/test3/backend/models"
)

// Client handles communication with an OpenAI-compatible LLM API.
type Client struct {
	cfg        models.ModelConfig
	baseURL    string
	apiKey     string
	modelID    string
	httpClient *http.Client
}

// ChatMessage represents a message in the chat format for the LLM API.
type ChatMessage struct {
	Role       string          `json:"role"`
	Content    *string         `json:"content"`
	ToolCalls  json.RawMessage `json:"tool_calls,omitempty"`
	ToolCallID string          `json:"tool_call_id,omitempty"`
	Name       string          `json:"name,omitempty"`
}

// strPtr is a helper to create a *string from a string value.
func strPtr(s string) *string { return &s }

type chatRequest struct {
	Model            string          `json:"model"`
	Messages         []ChatMessage   `json:"messages"`
	Tools            json.RawMessage `json:"tools,omitempty"`
	ToolChoice       string          `json:"tool_choice,omitempty"`
	Stream           bool            `json:"stream"`
	Temperature      *float64        `json:"temperature,omitempty"`
	TopP             *float64        `json:"top_p,omitempty"`
	MaxTokens        *int            `json:"max_tokens,omitempty"`
	PresencePenalty  *float64        `json:"presence_penalty,omitempty"`
	FrequencyPenalty *float64        `json:"frequency_penalty,omitempty"`
}

type chatResponse struct {
	Choices []chatChoice `json:"choices"`
}

type chatChoice struct {
	Index        int     `json:"index"`
	Message      chatMsg `json:"message"`
	Delta        chatMsg `json:"delta"`
	FinishReason string  `json:"finish_reason"`
}

type chatMsg struct {
	Role      string     `json:"role"`
	Content   string     `json:"content"`
	ToolCalls []toolCall `json:"tool_calls,omitempty"`
}

type toolCall struct {
	Index    int          `json:"index"`
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function functionCall `json:"function"`
}

type functionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type streamChunk struct {
	Choices []chatChoice `json:"choices"`
}

// NewClient creates a new LLM client for the given model configuration.
func NewClient(cfg models.ModelConfig) *Client {
	apiKey := cfg.APIKey
	if apiKey == "" {
		apiKey = "not-needed"
	}
	return &Client{
		cfg:     cfg,
		baseURL: strings.TrimRight(cfg.BaseURL, "/"),
		apiKey:  apiKey,
		modelID: cfg.ModelID,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// ToolsToOpenAI converts MCP tools to OpenAI function-calling format.
func ToolsToOpenAI(mcpTools []models.MCPTool) json.RawMessage {
	if len(mcpTools) == 0 {
		return nil
	}
	var tools []map[string]interface{}
	for _, t := range mcpTools {
		desc := t.Description
		if desc == "" {
			desc = "Tool: " + t.Name
		}
		tools = append(tools, map[string]interface{}{
			"type": "function",
			"function": map[string]interface{}{
				"name":        t.Name,
				"description": desc,
				"parameters":  t.InputSchema,
			},
		})
	}
	data, _ := json.Marshal(tools)
	return data
}

// StreamCallback is called for each text chunk during streaming.
type StreamCallback func(text string)

// ToolUseCallback is called just before each MCP tool invocation.
// It receives the tool call ID, tool name, and the parsed arguments.
type ToolUseCallback func(toolCallID string, toolName string, args map[string]interface{})

// ToolResultCallback is called after each MCP tool invocation with the result.
// toolCallID is the OpenAI tool_call_id, toolName is the function name, result is the raw result text.
type ToolResultCallback func(toolCallID string, toolName string, result string)

// buildMessages prepends a system prompt (if configured) to the conversation history.
func (c *Client) buildMessages(messages []ChatMessage) []ChatMessage {
	if c.cfg.SystemPrompt == "" {
		return messages
	}
	system := ChatMessage{
		Role:    "system",
		Content: strPtr(c.cfg.SystemPrompt),
	}
	out := make([]ChatMessage, 0, len(messages)+1)
	out = append(out, system)
	out = append(out, messages...)
	return out
}

// SendMessage sends a message to the LLM and handles the tool-calling loop.
// It calls streamCb with each text chunk as it arrives.
// It calls toolUseCb (if non-nil) before each MCP tool invocation.
// It calls toolResultCb (if non-nil) after each MCP tool invocation with the result.
// It returns the full assistant response and the full message history.
// If ctx is cancelled the loop stops early; partial content and a context error are returned.
func (c *Client) SendMessage(
	ctx context.Context,
	messages []ChatMessage,
	mcpTools []models.MCPTool,
	mcpClient *mcpclient.Client,
	streamCb StreamCallback,
	toolUseCb ToolUseCallback,
	toolResultCb ToolResultCallback,
) (string, []ChatMessage, error) {
	toolsJSON := ToolsToOpenAI(mcpTools)

	for {
		// Stop immediately if the caller cancelled before the next LLM round-trip.
		if err := ctx.Err(); err != nil {
			return "", messages, err
		}

		req := chatRequest{
			Model:            c.modelID,
			Messages:         c.buildMessages(messages),
			Stream:           true,
			Temperature:      c.cfg.Temperature,
			TopP:             c.cfg.TopP,
			MaxTokens:        c.cfg.MaxTokens,
			PresencePenalty:  c.cfg.PresencePenalty,
			FrequencyPenalty: c.cfg.FrequencyPenalty,
		}
		if len(toolsJSON) > 0 {
			req.Tools = toolsJSON
			req.ToolChoice = "auto"
		}

		body, err := json.Marshal(req)
		if err != nil {
			return "", messages, fmt.Errorf("marshal request: %w", err)
		}

		httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/chat/completions", bytes.NewReader(body))
		if err != nil {
			return "", messages, fmt.Errorf("create request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

		resp, err := c.httpClient.Do(httpReq)
		if err != nil {
			return "", messages, fmt.Errorf("send request: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			respBody, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return "", messages, fmt.Errorf("LLM API returned status %d: %s", resp.StatusCode, string(respBody))
		}

		// Parse SSE stream
		fullContent, toolCalls, err := c.parseStream(ctx, resp.Body, streamCb)
		resp.Body.Close()
		if err != nil {
			// If the context was cancelled, return the partial content collected so far
			// rather than an opaque stream error.
			if ctx.Err() != nil {
				return fullContent, messages, ctx.Err()
			}
			return "", messages, fmt.Errorf("parse stream: %w", err)
		}

		if len(toolCalls) == 0 {
			// No tool calls, we're done
			messages = append(messages, ChatMessage{
				Role:    "assistant",
				Content: strPtr(fullContent),
			})
			return fullContent, messages, nil
		}

		// There are tool calls - add assistant message with tool calls
		// Serialize without the stream-only "index" field
		type outToolCall struct {
			ID       string       `json:"id"`
			Type     string       `json:"type"`
			Function functionCall `json:"function"`
		}
		outTCs := make([]outToolCall, len(toolCalls))
		for i, tc := range toolCalls {
			outTCs[i] = outToolCall{ID: tc.ID, Type: tc.Type, Function: tc.Function}
		}
		tcJSON, _ := json.Marshal(outTCs)
		// When assistant has tool_calls, content should be null if empty
		var contentPtr *string
		if fullContent != "" {
			contentPtr = strPtr(fullContent)
		}
		messages = append(messages, ChatMessage{
			Role:      "assistant",
			Content:   contentPtr,
			ToolCalls: tcJSON,
		})

		// Execute each tool call via MCP
		for _, tc := range toolCalls {
			// Stop tool execution if context was cancelled.
			if err := ctx.Err(); err != nil {
				return fullContent, messages, err
			}

			var args map[string]interface{}
			if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
				args = map[string]interface{}{}
			}

			if toolUseCb != nil {
				toolUseCb(tc.ID, tc.Function.Name, args)
			}

			result := "Tool execution failed"
			if mcpClient != nil {
				toolResult, err := mcpClient.CallTool(ctx, tc.Function.Name, args)
				if err != nil {
					result = fmt.Sprintf("Error: %v", err)
				} else {
					result = toolResult
				}
			}

			if toolResultCb != nil {
				toolResultCb(tc.ID, tc.Function.Name, result)
			}

			messages = append(messages, ChatMessage{
				Role:       "tool",
				Content:    strPtr(result),
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
			})
		}

		// Loop back to send tool results to LLM
	}
}

func (c *Client) parseStream(ctx context.Context, body io.Reader, streamCb StreamCallback) (string, []toolCall, error) {
	// Read line by line for SSE format
	buf := make([]byte, 0, 4096)
	rawBuf := make([]byte, 4096)
	var fullContent strings.Builder
	var accumulatedToolCalls []toolCall

	for {
		// Bail out promptly if context was cancelled.
		if ctx.Err() != nil {
			break
		}
		n, err := body.Read(rawBuf)
		if n > 0 {
			buf = append(buf, rawBuf[:n]...)

			// Process complete SSE lines
			for {
				idx := bytes.IndexByte(buf, '\n')
				if idx < 0 {
					break
				}
				line := string(buf[:idx])
				buf = buf[idx+1:]

				line = strings.TrimSpace(line)
				if line == "" || line == ":" {
					continue
				}

				if strings.HasPrefix(line, "data: ") {
					data := strings.TrimPrefix(line, "data: ")
					if data == "[DONE]" {
						goto done
					}

					var chunk streamChunk
					if err := json.Unmarshal([]byte(data), &chunk); err != nil {
						continue
					}

					for _, choice := range chunk.Choices {
						if choice.Delta.Content != "" {
							fullContent.WriteString(choice.Delta.Content)
							if streamCb != nil {
								streamCb(choice.Delta.Content)
							}
						}
						for _, tc := range choice.Delta.ToolCalls {
							// Accumulate tool calls
							accumulatedToolCalls = mergeToolCalls(accumulatedToolCalls, tc)
						}
					}
				}
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return fullContent.String(), accumulatedToolCalls, err
		}
	}

done:
	return fullContent.String(), accumulatedToolCalls, nil
}

// mergeToolCalls handles the streaming tool call accumulation where each
// chunk may contain partial tool call data. Streaming deltas use the "index"
// field to identify which tool call the fragment belongs to.
func mergeToolCalls(existing []toolCall, delta toolCall) []toolCall {
	// Find by index
	for i := range existing {
		if existing[i].Index == delta.Index {
			if delta.Function.Arguments != "" {
				// If the delta contains a complete JSON object, replace
				// rather than append. Some models (e.g. Mistral via LiteLLM)
				// stream partial fragments then send the full object.
				trimmed := strings.TrimSpace(delta.Function.Arguments)
				if strings.HasPrefix(trimmed, "{") && strings.HasSuffix(trimmed, "}") {
					if json.Valid([]byte(trimmed)) {
						existing[i].Function.Arguments = trimmed
					} else {
						existing[i].Function.Arguments += delta.Function.Arguments
					}
				} else {
					existing[i].Function.Arguments += delta.Function.Arguments
				}
			}
			if delta.Function.Name != "" {
				existing[i].Function.Name = delta.Function.Name
			}
			if delta.ID != "" {
				existing[i].ID = delta.ID
			}
			if delta.Type != "" {
				existing[i].Type = delta.Type
			}
			return existing
		}
	}
	// New tool call at this index
	existing = append(existing, delta)
	return existing
}
