package models

import "time"

// ModelConfig represents an LLM model configuration.
type ModelConfig struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	BaseURL          string    `json:"base_url"`
	APIKey           string    `json:"api_key,omitempty"`
	ModelID          string    `json:"model_id"`
	SystemPrompt     string    `json:"system_prompt,omitempty"`
	Temperature      *float64  `json:"temperature,omitempty"`
	TopP             *float64  `json:"top_p,omitempty"`
	MaxTokens        *int      `json:"max_tokens,omitempty"`
	PresencePenalty  *float64  `json:"presence_penalty,omitempty"`
	FrequencyPenalty *float64  `json:"frequency_penalty,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
}

// MCPServer represents an MCP server configuration.
type MCPServer struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	URL       string    `json:"url"`
	APIKey    string    `json:"api_key,omitempty"`
	Transport string    `json:"transport"` // "streamable-http" or "sse"
	CreatedAt time.Time `json:"created_at"`
}

// Conversation represents a chat conversation.
type Conversation struct {
	ID               string    `json:"id"`
	Title            string    `json:"title"`
	ModelID          string    `json:"model_id"`
	MCPServerID      string    `json:"mcp_server_id,omitempty"` // legacy single-server field, kept for backward compat
	MCPServerIDs     []string  `json:"mcp_server_ids"`
	PromptTokens     int       `json:"prompt_tokens"`
	CompletionTokens int       `json:"completion_tokens"`
	TotalTokens      int       `json:"total_tokens"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// Message represents a single message in a conversation.
type Message struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	Role           string    `json:"role"`
	Content        string    `json:"content"`
	ToolCalls      string    `json:"tool_calls,omitempty"`
	ToolCallID     string    `json:"tool_call_id,omitempty"`
	Name           string    `json:"name,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// ConversationWithMessages is a conversation along with all its messages.
type ConversationWithMessages struct {
	Conversation
	Messages []Message `json:"messages"`
}

// --- Request / Response types ---

type CreateModelRequest struct {
	Name             string   `json:"name"`
	BaseURL          string   `json:"base_url"`
	APIKey           string   `json:"api_key"`
	ModelID          string   `json:"model_id"`
	SystemPrompt     string   `json:"system_prompt,omitempty"`
	Temperature      *float64 `json:"temperature,omitempty"`
	TopP             *float64 `json:"top_p,omitempty"`
	MaxTokens        *int     `json:"max_tokens,omitempty"`
	PresencePenalty  *float64 `json:"presence_penalty,omitempty"`
	FrequencyPenalty *float64 `json:"frequency_penalty,omitempty"`
}

type UpdateModelRequest struct {
	Name                  *string  `json:"name,omitempty"`
	BaseURL               *string  `json:"base_url,omitempty"`
	APIKey                *string  `json:"api_key,omitempty"`
	ModelID               *string  `json:"model_id,omitempty"`
	SystemPrompt          *string  `json:"system_prompt,omitempty"`
	Temperature           *float64 `json:"temperature,omitempty"`
	TopP                  *float64 `json:"top_p,omitempty"`
	MaxTokens             *int     `json:"max_tokens,omitempty"`
	PresencePenalty       *float64 `json:"presence_penalty,omitempty"`
	FrequencyPenalty      *float64 `json:"frequency_penalty,omitempty"`
	ClearTemperature      bool     `json:"clear_temperature,omitempty"`
	ClearTopP             bool     `json:"clear_top_p,omitempty"`
	ClearMaxTokens        bool     `json:"clear_max_tokens,omitempty"`
	ClearPresencePenalty  bool     `json:"clear_presence_penalty,omitempty"`
	ClearFrequencyPenalty bool     `json:"clear_frequency_penalty,omitempty"`
}

type CreateMCPServerRequest struct {
	Name      string `json:"name"`
	URL       string `json:"url"`
	APIKey    string `json:"api_key,omitempty"`
	Transport string `json:"transport,omitempty"` // "streamable-http" or "sse"; defaults to "streamable-http"
}

type UpdateMCPServerRequest struct {
	Name      *string `json:"name,omitempty"`
	URL       *string `json:"url,omitempty"`
	APIKey    *string `json:"api_key,omitempty"`
	Transport *string `json:"transport,omitempty"`
}

type CreateConversationRequest struct {
	Title        string   `json:"title,omitempty"`
	ModelID      string   `json:"model_id"`
	MCPServerIDs []string `json:"mcp_server_ids,omitempty"`
}

type UpdateConversationRequest struct {
	Title        *string   `json:"title,omitempty"`
	ModelID      *string   `json:"model_id,omitempty"`
	MCPServerIDs *[]string `json:"mcp_server_ids,omitempty"`
}

type SendMessageRequest struct {
	ConversationID string `json:"conversation_id"`
	Content        string `json:"content"`
}

type EditMessageRequest struct {
	ConversationID string `json:"conversation_id"`
	MessageID      string `json:"message_id"`
	NewContent     string `json:"new_content"`
}

// MCPTool represents a tool discovered from an MCP server.
type MCPTool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema interface{} `json:"inputSchema"`
}
