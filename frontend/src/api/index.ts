const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

// Health
export const healthApi = {
  check: () =>
    fetch(`${API_BASE}/health`, { method: 'GET' })
      .then((r) => r.ok)
      .catch(() => false),
};

// Models
export const modelsApi = {
  list: () => request<import('../types').ModelConfig[]>('/models'),
  create: (data: import('../types').CreateModelRequest) =>
    request<import('../types').ModelConfig>('/models', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: import('../types').UpdateModelRequest) =>
    request<import('../types').ModelConfig>(`/models/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/models/${id}`, { method: 'DELETE' }),
};

// MCP Servers
export const mcpServersApi = {
  list: () => request<import('../types').MCPServer[]>('/mcp-servers'),
  create: (data: import('../types').CreateMCPServerRequest) =>
    request<import('../types').MCPServer>('/mcp-servers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<import('../types').CreateMCPServerRequest>) =>
    request<import('../types').MCPServer>(`/mcp-servers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/mcp-servers/${id}`, { method: 'DELETE' }),
  test: (id: string) =>
    request<{ success: boolean; error?: string; tools: number; tool_list?: Array<{ name: string; description: string }> }>(`/mcp-servers/${id}/test`, { method: 'POST' }),
};

// Conversations
export const conversationsApi = {
  list: () => request<import('../types').Conversation[]>('/conversations'),
  get: (id: string) => request<import('../types').ConversationWithMessages>(`/conversations/${id}`),
  create: (data: import('../types').CreateConversationRequest) =>
    request<import('../types').Conversation>('/conversations', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { title: string }) =>
    request<void>(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/conversations/${id}`, { method: 'DELETE' }),
};

// Chat (SSE streaming)
export function sendMessage(
  data: import('../types').SendMessageRequest,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (error: string) => void,
  onToolUse?: (payload: { id: string; tool: string; label: string; args: Record<string, unknown>; toolCallId: string }) => void,
  onToolResult?: (payload: { msgId: string; tool: string; toolCallId: string }) => void,
  onAbort?: () => void,
): AbortController {
  return streamChat(`${API_BASE}/chat/send`, data, onChunk, onDone, onError, onToolUse, onToolResult, onAbort);
}

export function editMessage(
  data: import('../types').EditMessageRequest,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (error: string) => void,
  onToolUse?: (payload: { id: string; tool: string; label: string; args: Record<string, unknown>; toolCallId: string }) => void,
  onToolResult?: (payload: { msgId: string; tool: string; toolCallId: string }) => void,
  onAbort?: () => void,
): AbortController {
  return streamChat(`${API_BASE}/chat/edit`, data, onChunk, onDone, onError, onToolUse, onToolResult, onAbort);
}

function streamChat(
  url: string,
  data: object,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (error: string) => void,
  onToolUse?: (payload: { id: string; tool: string; label: string; args: Record<string, unknown>; toolCallId: string }) => void,
  onToolResult?: (payload: { msgId: string; tool: string; toolCallId: string }) => void,
  onAbort?: () => void,
): AbortController {
  const controller = new AbortController();

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        onError(body.error || res.statusText);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onError('No response body');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);
          try {
            const event: import('../types').SSEEvent = JSON.parse(jsonStr);
            if (event.type === 'chunk') {
              onChunk(event.content);
            } else if (event.type === 'done') {
              onDone(event.content);
            } else if (event.type === 'error') {
              onError(event.content);
            } else if (event.type === 'tool_use' && onToolUse) {
              onToolUse({
                id: event.msg_id ?? crypto.randomUUID(),
                tool: event.tool ?? '',
                label: event.label ?? '',
                args: event.args ?? {},
                toolCallId: event.tool_call_id ?? '',
              });
            } else if (event.type === 'tool_result' && onToolResult) {
              onToolResult({
                msgId: event.msg_id ?? '',
                tool: event.tool ?? '',
                toolCallId: event.tool_call_id ?? '',
              });
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    })
    .catch((err) => {
      if (err.name === 'AbortError') {
        onAbort?.();
      } else {
        onError(err.message);
      }
    });

  return controller;
}
