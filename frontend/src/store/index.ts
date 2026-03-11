import { create } from 'zustand';
import type { ModelConfig, MCPServer, Conversation, Message } from '../types';
import { modelsApi, mcpServersApi, conversationsApi } from '../api';
import { getTheme, type Theme } from '../themes';

function applyThemeToDOM(theme: Theme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    // Convert camelCase to kebab-case: bgPrimary -> bg-primary
    const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(`--color-${cssVar}`, value);
  }
}

export type NotificationSeverity = 'error' | 'warning' | 'info';

export interface AppNotification {
  id: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  /** When set, shows an actionable link/button label */
  actionLabel?: string;
  /** Route to navigate to when the action is clicked */
  actionRoute?: string;
}

interface AppState {
  // Theme
  themeId: string;
  theme: Theme;
  setTheme: (id: string) => void;

  // Models
  models: ModelConfig[];
  loadModels: () => Promise<void>;

  // MCP Servers
  mcpServers: MCPServer[];
  loadMCPServers: () => Promise<void>;

  // Conversations
  conversations: Conversation[];
  loadConversations: () => Promise<void>;

  // Active conversation
  activeConversationId: string | null;
  activeMessages: Message[];
  setActiveConversation: (id: string | null) => Promise<void>;

  // Selected model & MCP for new chats
  selectedModelId: string | null;
  setSelectedModelId: (id: string | null) => void;
  selectedMCPServerIds: string[];
  setSelectedMCPServerIds: (ids: string[]) => void;

  // Streaming state
  isStreaming: boolean;
  streamingContent: string;
  setIsStreaming: (v: boolean) => void;
  appendStreamingContent: (text: string) => void;
  resetStreamingContent: () => void;

  // Token usage for the active conversation (updated after each response)
  lastUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  setLastUsage: (usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null) => void;

  // Add a message to the active conversation locally
  addMessage: (msg: Message) => void;

  // Replace messages from a given message id onward (for edit flow)
  // Removes the message with the given id and all messages after it,
  // then inserts the provided new message in their place.
  replaceMessagesFrom: (fromMessageId: string, newMessage: Message) => void;

  // Diagnostic notifications
  notifications: AppNotification[];
  addNotification: (n: Omit<AppNotification, 'id'>) => void;
  dismissNotification: (id: string) => void;
  /** Replace all notifications with the given key prefix (used to refresh diagnostics) */
  clearNotificationsByPrefix: (prefix: string) => void;
}

const savedThemeId = localStorage.getItem('chatui-theme') || 'light';
const initialTheme = getTheme(savedThemeId);
// Apply on load
applyThemeToDOM(initialTheme);

export const useAppStore = create<AppState>((set, get) => ({
  themeId: savedThemeId,
  theme: initialTheme,
  setTheme: (id) => {
    const theme = getTheme(id);
    localStorage.setItem('chatui-theme', id);
    applyThemeToDOM(theme);
    set({ themeId: id, theme });
  },

  models: [],
  loadModels: async () => {
    const models = await modelsApi.list();
    set({ models });
    // Auto-select first model if none selected
    if (!get().selectedModelId && models.length > 0) {
      set({ selectedModelId: models[0].id });
    }
  },

  mcpServers: [],
  loadMCPServers: async () => {
    const mcpServers = await mcpServersApi.list();
    set({ mcpServers });
  },

  conversations: [],
  loadConversations: async () => {
    const conversations = await conversationsApi.list();
    set({ conversations });
  },

  activeConversationId: null,
  activeMessages: [],
  setActiveConversation: async (id) => {
    if (!id) {
      set({ activeConversationId: null, activeMessages: [], lastUsage: null });
      return;
    }
    const conv = await conversationsApi.get(id);
    set({
      activeConversationId: id,
      activeMessages: conv.messages,
      selectedModelId: conv.model_id || get().selectedModelId,
      selectedMCPServerIds: conv.mcp_server_ids ?? [],
      lastUsage: conv.total_tokens > 0
        ? { promptTokens: conv.prompt_tokens, completionTokens: conv.completion_tokens, totalTokens: conv.total_tokens }
        : null,
    });
  },

  selectedModelId: null,
  setSelectedModelId: (id) => {
    const { activeConversationId } = get();
    set({ selectedModelId: id });
    if (activeConversationId && id) {
      conversationsApi.update(activeConversationId, { model_id: id }).catch((err) =>
        console.error('Failed to persist model change:', err)
      );
    }
  },
  selectedMCPServerIds: [],
  setSelectedMCPServerIds: (ids) => {
    const { activeConversationId } = get();
    set({ selectedMCPServerIds: ids });
    if (activeConversationId) {
      conversationsApi.update(activeConversationId, { mcp_server_ids: ids }).catch((err) =>
        console.error('Failed to persist MCP server change:', err)
      );
    }
  },

  isStreaming: false,
  streamingContent: '',
  setIsStreaming: (v) => set({ isStreaming: v }),
  appendStreamingContent: (text) =>
    set((s) => ({ streamingContent: s.streamingContent + text })),
  resetStreamingContent: () => set({ streamingContent: '' }),

  lastUsage: null,
  setLastUsage: (usage) => set({ lastUsage: usage }),

  addMessage: (msg) =>
    set((s) => ({ activeMessages: [...s.activeMessages, msg] })),

  replaceMessagesFrom: (fromMessageId, newMessage) =>
    set((s) => {
      const idx = s.activeMessages.findIndex((m) => m.id === fromMessageId);
      if (idx === -1) return {};
      return { activeMessages: [...s.activeMessages.slice(0, idx), newMessage] };
    }),

  notifications: [],
  addNotification: (n) =>
    set((s) => ({
      notifications: [...s.notifications, { ...n, id: crypto.randomUUID() }],
    })),
  dismissNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  clearNotificationsByPrefix: (prefix) =>
    set((s) => ({ notifications: s.notifications.filter((n) => !n.id.startsWith(prefix)) })),
}));
