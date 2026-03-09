export interface ModelConfig {
  id: string;
  name: string;
  base_url: string;
  api_key?: string;
  model_id: string;
  system_prompt?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  created_at: string;
}

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  api_key?: string;
  transport: 'streamable-http' | 'sse';
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  model_id: string;
  mcp_server_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'tool' | 'tool_use';
  content: string;
  tool_calls?: string;
  tool_call_id?: string;
  name?: string;
  created_at: string;
}

export interface ToolUsePayload {
  tool: string;
  label: string;
  args: Record<string, unknown>;
  tool_call_id?: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export interface CreateModelRequest {
  name: string;
  base_url: string;
  api_key: string;
  model_id: string;
  system_prompt?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface UpdateModelRequest {
  name?: string;
  base_url?: string;
  api_key?: string;
  model_id?: string;
  system_prompt?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  clear_temperature?: boolean;
  clear_top_p?: boolean;
  clear_max_tokens?: boolean;
  clear_presence_penalty?: boolean;
  clear_frequency_penalty?: boolean;
}

export interface CreateMCPServerRequest {
  name: string;
  url: string;
  api_key?: string;
  transport?: 'streamable-http' | 'sse';
}

export interface CreateConversationRequest {
  title?: string;
  model_id: string;
  mcp_server_id?: string;
}

export interface SendMessageRequest {
  conversation_id: string;
  content: string;
}

export interface EditMessageRequest {
  conversation_id: string;
  message_id: string;
  new_content: string;
}

export interface SSEEvent {
  type: 'chunk' | 'done' | 'error' | 'tool_use' | 'tool_result';
  content: string;
  // tool_use event fields
  tool?: string;
  label?: string;
  args?: Record<string, unknown>;
  msg_id?: string;
  // tool_result event fields
  tool_call_id?: string;
}
