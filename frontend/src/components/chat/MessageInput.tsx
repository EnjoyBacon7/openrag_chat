import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Square } from 'lucide-react';
import { useAppStore } from '../../store';
import { conversationsApi, sendMessage } from '../../api';

export default function MessageInput() {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();

  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const selectedMCPServerId = useAppStore((s) => s.selectedMCPServerId);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const setIsStreaming = useAppStore((s) => s.setIsStreaming);
  const appendStreamingContent = useAppStore((s) => s.appendStreamingContent);
  const resetStreamingContent = useAppStore((s) => s.resetStreamingContent);
  const addMessage = useAppStore((s) => s.addMessage);
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);
  const loadConversations = useAppStore((s) => s.loadConversations);
  const clearSelectionChangeBanner = useAppStore((s) => s.clearSelectionChangeBanner);
  const models = useAppStore((s) => s.models);

  // Cancel any in-flight stream on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    // onAbort handler below will finalize state
  }, []);

  const handleSubmit = useCallback(async () => {
    const content = text.trim();
    if (!content || isStreaming || !selectedModelId) return;

    clearSelectionChangeBanner();
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    let convId = activeConversationId;

    if (!convId) {
      try {
        const conv = await conversationsApi.create({
          model_id: selectedModelId,
          mcp_server_id: selectedMCPServerId || undefined,
        });
        convId = conv.id;
        await setActiveConversation(convId);
        navigate(`/chat/${convId}`);
        loadConversations();
      } catch (err) {
        console.error('Failed to create conversation:', err);
        return;
      }
    }

    addMessage({
      id: crypto.randomUUID(),
      conversation_id: convId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    });

    setIsStreaming(true);
    resetStreamingContent();

    abortRef.current = sendMessage(
      { conversation_id: convId, content },
      (chunk) => {
        appendStreamingContent(chunk);
      },
      (fullText) => {
        setIsStreaming(false);
        addMessage({
          id: crypto.randomUUID(),
          conversation_id: convId!,
          role: 'assistant',
          content: fullText,
          created_at: new Date().toISOString(),
        });
        resetStreamingContent();
        loadConversations();
      },
      (error) => {
        setIsStreaming(false);
        addMessage({
          id: crypto.randomUUID(),
          conversation_id: convId!,
          role: 'assistant',
          content: `Error: ${error}`,
          created_at: new Date().toISOString(),
        });
        resetStreamingContent();
      },
      (toolUse) => {
        addMessage({
          id: toolUse.id,
          conversation_id: convId!,
          role: 'tool_use',
          content: JSON.stringify({ tool: toolUse.tool, label: toolUse.label, args: toolUse.args, tool_call_id: toolUse.toolCallId }),
          created_at: new Date().toISOString(),
        });
      },
      (toolResult) => {
        addMessage({
          id: toolResult.msgId,
          conversation_id: convId!,
          role: 'tool',
          content: '',  // content will be loaded on next conversation fetch
          name: toolResult.tool,
          tool_call_id: toolResult.toolCallId,
          created_at: new Date().toISOString(),
        });
      },
      () => {
        // onAbort: stream was stopped by user — persist any partial content that was streamed
        const partial = useAppStore.getState().streamingContent;
        setIsStreaming(false);
        if (partial.trim()) {
          addMessage({
            id: crypto.randomUUID(),
            conversation_id: convId!,
            role: 'assistant',
            content: partial,
            created_at: new Date().toISOString(),
          });
        }
        resetStreamingContent();
        loadConversations();
      },
    );
  }, [
    text,
    isStreaming,
    selectedModelId,
    selectedMCPServerId,
    activeConversationId,
    addMessage,
    setIsStreaming,
    appendStreamingContent,
    resetStreamingContent,
    setActiveConversation,
    loadConversations,
    clearSelectionChangeBanner,
    navigate,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const selectedModel = models.find((m) => m.id === selectedModelId);

  return (
    <div
      className="px-4 py-3"
      style={{
        backgroundColor: 'var(--color-bg-primary)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedModel ? `Message ${selectedModel.name}...` : 'Select a model first...'}
            disabled={!selectedModelId || isStreaming}
            rows={1}
            className="flex-1 min-w-0 resize-none rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--color-bg-input)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
              minHeight: '42px',
              maxHeight: '120px',
              '--tw-ring-color': 'var(--color-border-focus)',
            } as React.CSSProperties}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={isStreaming ? handleStop : handleSubmit}
            disabled={isStreaming ? false : (!text.trim() || !selectedModelId)}
            className="flex-shrink-0 h-[42px] w-[42px] flex items-center justify-center rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-text-inverse)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent)')}
            title={isStreaming ? 'Stop generation' : 'Send message'}
          >
            {isStreaming ? <Square size={16} /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
