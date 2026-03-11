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
	"github.com/google/uuid"
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

type streamOptions struct {
	IncludeUsage bool `json:"include_usage"`
}

type chatRequest struct {
	Model            string          `json:"model"`
	Messages         []ChatMessage   `json:"messages"`
	Tools            json.RawMessage `json:"tools,omitempty"`
	ToolChoice       string          `json:"tool_choice,omitempty"`
	Stream           bool            `json:"stream"`
	StreamOptions    *streamOptions  `json:"stream_options,omitempty"`
	Temperature      *float64        `json:"temperature,omitempty"`
	TopP             *float64        `json:"top_p,omitempty"`
	MaxTokens        *int            `json:"max_tokens,omitempty"`
	PresencePenalty  *float64        `json:"presence_penalty,omitempty"`
	FrequencyPenalty *float64        `json:"frequency_penalty,omitempty"`
}

// Usage holds token counts returned by the LLM API.
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
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
	Usage   *Usage       `json:"usage,omitempty"`
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

// UsageCallback is called once after each LLM round-trip with the final token counts.
// It accumulates across multiple loop iterations (tool-call rounds).
type UsageCallback func(usage Usage)

// AssistantToolCallsCallback is called once per LLM round-trip that returns tool
// calls, immediately after the response is parsed and before any tool is executed.
// It receives the full content string (may be empty) and the serialized tool_calls
// JSON so the caller can persist the assistant+tool_calls message to the DB.
type AssistantToolCallsCallback func(content string, toolCallsJSON json.RawMessage)

// toolUseInstruction is appended to the system prompt whenever tools are
// available. It prevents the model from describing a tool call in prose
// instead of actually invoking it.
const toolUseInstruction = `You have access to tools. NEVER describe a tool call or suggest one in text — always invoke tools directly when you need information or need to perform an action. If a tool result indicates more data is available (e.g. has_more=true or suggests a follow-up call), always make that follow-up tool call before responding to the user.`

// buildMessages prepends a system prompt to the conversation history.
// When tools are present, a tool-use enforcement instruction is always included
// (appended to the user-configured system prompt if one exists, or used alone).
func (c *Client) buildMessages(messages []ChatMessage, hasTools bool) []ChatMessage {
	var systemContent string
	if c.cfg.SystemPrompt != "" {
		systemContent = c.cfg.SystemPrompt
	}
	if hasTools {
		if systemContent != "" {
			systemContent += "\n\n" + toolUseInstruction
		} else {
			systemContent = toolUseInstruction
		}
	}
	if systemContent == "" {
		return messages
	}
	system := ChatMessage{
		Role:    "system",
		Content: strPtr(systemContent),
	}
	out := make([]ChatMessage, 0, len(messages)+1)
	out = append(out, system)
	out = append(out, messages...)
	return out
}

// buildToolClientMap builds a map from tool name → the MCP client that registered it.
// When multiple clients expose the same tool name, the last one wins.
func buildToolClientMap(clients []*mcpclient.Client, tools []models.MCPTool) map[string]*mcpclient.Client {
	m := make(map[string]*mcpclient.Client, len(tools))
	if len(clients) == 0 {
		return m
	}
	for _, cli := range clients {
		if cli == nil {
			continue
		}
		for _, t := range cli.Tools() {
			m[t.Name] = cli
		}
	}
	return m
}

// SendMessage sends a message to the LLM and handles the tool-calling loop.
// It calls streamCb with each text chunk as it arrives.
// It calls toolUseCb (if non-nil) before each MCP tool invocation.
// It calls toolResultCb (if non-nil) after each MCP tool invocation with the result.
// It calls usageCb (if non-nil) once per LLM round-trip with cumulative token counts.
// It returns the full assistant response and the full message history.
// If ctx is cancelled the loop stops early; partial content and a context error are returned.
//
// mcpClients is a slice of MCP clients; tool calls are routed to the client that
// registered the requested tool. Pass nil or an empty slice to disable tool use.
func (c *Client) SendMessage(
	ctx context.Context,
	messages []ChatMessage,
	mcpTools []models.MCPTool,
	mcpClients []*mcpclient.Client,
	streamCb StreamCallback,
	toolUseCb ToolUseCallback,
	toolResultCb ToolResultCallback,
	usageCb UsageCallback,
	assistantToolCallsCb AssistantToolCallsCallback,
) (string, []ChatMessage, error) {
	toolsJSON := ToolsToOpenAI(mcpTools)

	// Build a map from tool name → the client that owns it, for O(1) routing.
	toolClientMap := buildToolClientMap(mcpClients, mcpTools)

	var cumulativeUsage Usage

	for {
		// Stop immediately if the caller cancelled before the next LLM round-trip.
		if err := ctx.Err(); err != nil {
			return "", messages, err
		}

		req := chatRequest{
			Model:            c.modelID,
			Messages:         c.buildMessages(messages, len(toolsJSON) > 0),
			Stream:           true,
			StreamOptions:    &streamOptions{IncludeUsage: true},
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
		fullContent, toolCalls, roundUsage, err := c.parseStream(ctx, resp.Body, streamCb)
		resp.Body.Close()
		if err != nil {
			// If the context was cancelled, return the partial content collected so far
			// rather than an opaque stream error.
			if ctx.Err() != nil {
				return fullContent, messages, ctx.Err()
			}
			return "", messages, fmt.Errorf("parse stream: %w", err)
		}

		// Accumulate token counts across tool-call loop iterations.
		cumulativeUsage.PromptTokens += roundUsage.PromptTokens
		cumulativeUsage.CompletionTokens += roundUsage.CompletionTokens
		cumulativeUsage.TotalTokens += roundUsage.TotalTokens
		if usageCb != nil && (roundUsage.TotalTokens > 0) {
			usageCb(cumulativeUsage)
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

		// Persist the assistant+tool_calls message before executing tools so
		// the DB always has the full valid OpenAI message sequence.
		if assistantToolCallsCb != nil {
			assistantToolCallsCb(fullContent, tcJSON)
		}

		// Execute each tool call via the appropriate MCP client
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

			// Route this tool call to the client that owns the tool.
			ownerClient := toolClientMap[tc.Function.Name]

			result := "Tool execution failed"
			if ownerClient != nil {
				toolResult, err := ownerClient.CallTool(ctx, tc.Function.Name, args)
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

			// Some MCP servers embed a follow-up call suggestion in the tool
			// result text (e.g. "Use the following call to get the contents
			// [{"name":"get_file_chunks","arguments":{...}}]"). Execute those
			// calls immediately so the model receives their results instead of
			// just seeing the suggestion and echoing it to the user.
			if ownerClient != nil {
				for _, embedded := range extractEmbeddedCalls(result) {
					if ctx.Err() != nil {
						break
					}
					embeddedID := uuid.New().String()

					// Build a synthetic assistant message with tool_calls so
					// the history stays valid for the OpenAI API.
					type outToolCall struct {
						ID       string       `json:"id"`
						Type     string       `json:"type"`
						Function functionCall `json:"function"`
					}
					embeddedArgsJSON, _ := json.Marshal(embedded.Arguments)
					syntheticTCs := []outToolCall{{
						ID:   embeddedID,
						Type: "function",
						Function: functionCall{
							Name:      embedded.Name,
							Arguments: string(embeddedArgsJSON),
						},
					}}
					syntheticTCsJSON, _ := json.Marshal(syntheticTCs)
					messages = append(messages, ChatMessage{
						Role:      "assistant",
						Content:   nil,
						ToolCalls: syntheticTCsJSON,
					})

					// Persist the synthetic assistant+tool_calls message too.
					if assistantToolCallsCb != nil {
						assistantToolCallsCb("", syntheticTCsJSON)
					}

					if toolUseCb != nil {
						toolUseCb(embeddedID, embedded.Name, embedded.Arguments)
					}

					// Route the embedded call to the same client as the parent tool
					// (embedded calls are defined by the same server).
					embeddedResult := "Tool execution failed"
					embeddedToolResult, err := ownerClient.CallTool(ctx, embedded.Name, embedded.Arguments)
					if err != nil {
						embeddedResult = fmt.Sprintf("Error: %v", err)
					} else {
						embeddedResult = embeddedToolResult
					}

					if toolResultCb != nil {
						toolResultCb(embeddedID, embedded.Name, embeddedResult)
					}

					messages = append(messages, ChatMessage{
						Role:       "tool",
						Content:    strPtr(embeddedResult),
						ToolCallID: embeddedID,
						Name:       embedded.Name,
					})
				}
			}
		}

		// Loop back to send tool results to LLM
	}
}

func (c *Client) parseStream(ctx context.Context, body io.Reader, streamCb StreamCallback) (string, []toolCall, Usage, error) {
	// Read line by line for SSE format
	buf := make([]byte, 0, 4096)
	rawBuf := make([]byte, 4096)
	var fullContent strings.Builder
	var accumulatedToolCalls []toolCall
	var usage Usage

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

					// Capture usage from the final chunk (sent after [DONE] by some
					// providers, or in the last data chunk with stream_options).
					if chunk.Usage != nil && chunk.Usage.TotalTokens > 0 {
						usage = *chunk.Usage
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
			return fullContent.String(), accumulatedToolCalls, usage, err
		}
	}

done:
	return fullContent.String(), accumulatedToolCalls, usage, nil
}

// embeddedCall represents a follow-up tool call suggested inside a tool result.
type embeddedCall struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

// extractEmbeddedCalls scans a tool result string for an embedded follow-up
// call list of the form:
//
//	[{"name": "tool_name", "arguments": {...}}, ...]
//
// Some MCP servers return this pattern to instruct the client to issue a
// subsequent tool invocation (e.g. "Use the following call to get the
// contents [...]"). When found the calls are returned so the agent loop can
// execute them immediately instead of waiting for the LLM to re-request them.
func extractEmbeddedCalls(result string) []embeddedCall {
	// Find the first '[' that opens what might be a call list.
	start := strings.Index(result, "[{")
	if start < 0 {
		return nil
	}
	// Find the matching closing ']' (simple bracket counting).
	depth := 0
	end := -1
	for i := start; i < len(result); i++ {
		switch result[i] {
		case '[', '{':
			depth++
		case ']', '}':
			depth--
			if depth == 0 {
				end = i
			}
		}
		if end >= 0 {
			break
		}
	}
	if end < 0 {
		return nil
	}
	candidate := result[start : end+1]
	var calls []embeddedCall
	if err := json.Unmarshal([]byte(candidate), &calls); err != nil {
		return nil
	}
	// Only treat as embedded calls when every entry has a non-empty name.
	for _, c := range calls {
		if c.Name == "" {
			return nil
		}
	}
	return calls
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
