import { useRef, useEffect, useState, useCallback } from 'react';
import { Wrench, ChevronDown, ChevronRight, Pencil, X, Check, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '../../store';
import { editMessage } from '../../api';
import type { Message, ToolUsePayload } from '../../types';

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>,
        code: ({ children, className }) => {
          const isBlock = className?.includes('language-');
          if (isBlock) {
            return (
              <code
                className="block text-xs font-mono whitespace-pre-wrap rounded px-3 py-2 my-2 overflow-x-auto"
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {children}
              </code>
            );
          }
          return (
            <code
              className="text-xs font-mono rounded px-1 py-0.5"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}
            >
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre
            className="my-2 rounded overflow-x-auto"
            style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
          >
            {children}
          </pre>
        ),
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote
            className="border-l-2 pl-3 my-2 italic text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3" style={{ borderColor: 'var(--color-border)' }} />,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: 'var(--color-accent)' }}
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="text-xs w-full border-collapse" style={{ border: '1px solid var(--color-border)' }}>
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th
            className="px-3 py-1.5 text-left font-semibold"
            style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-1.5" style={{ border: '1px solid var(--color-border)' }}>
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── Tool result modal ────────────────────────────────────────────────────────

function ToolResultModal({
  toolName,
  result,
  onClose,
}: {
  toolName: string;
  result: string;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh]"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <FileText size={14} style={{ color: 'var(--color-accent)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              Result: {toolName.replace(/_/g, ' ')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
          >
            <X size={16} />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm" style={{ color: 'var(--color-text-primary)' }}>
          <MarkdownContent content={result} />
        </div>
      </div>
    </div>
  );
}

// ─── Tool-use card ────────────────────────────────────────────────────────────

/** Priority keys used to extract the most meaningful argument value. */
const PRIORITY_KEYS = ['query', 'q', 'search', 'text', 'prompt', 'message', 'path', 'url', 'id', 'name', 'file_id', 'partition'];

function toolUseHumanLabel(payload: ToolUsePayload): string {
  const friendly = payload.tool.replace(/_/g, ' ');
  // Find the first priority key that has a value
  for (const k of PRIORITY_KEYS) {
    const v = payload.args[k];
    if (v !== undefined && v !== null && v !== '') {
      return `Ran ${friendly} for "${v}"`;
    }
  }
  // Fall back to first arg value, or just the tool name
  const firstVal = Object.values(payload.args).find((v) => v !== undefined && v !== null && v !== '');
  if (firstVal !== undefined) {
    return `Ran ${friendly} for "${firstVal}"`;
  }
  return `Ran ${friendly}`;
}

function ToolUseCard({ message, resultMessage }: { message: Message; resultMessage?: Message }) {
  const [expanded, setExpanded] = useState(false);
  const [showResult, setShowResult] = useState(false);
  let payload: ToolUsePayload | null = null;
  try {
    payload = JSON.parse(message.content) as ToolUsePayload;
  } catch {
    // malformed — show nothing
  }

  const hasArgs = payload !== null && Object.keys(payload.args ?? {}).length > 0;
  const humanLabel = payload ? toolUseHumanLabel(payload) : message.content;
  const toolName = payload?.tool ?? message.content;

  return (
    <>
      <div className="flex justify-center">
        <div
          className="inline-flex flex-col rounded-lg text-xs"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            maxWidth: '72%',
          }}
        >
          {/* Header row */}
          <div className="flex items-center gap-1">
            <button
              className="flex items-center gap-2 px-3 py-1.5 flex-1 text-left"
              style={{ cursor: hasArgs ? 'pointer' : 'default' }}
              onClick={() => hasArgs && setExpanded((v) => !v)}
              disabled={!hasArgs}
            >
              <Wrench size={12} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {humanLabel}
              </span>
              {hasArgs && (
                expanded
                  ? <ChevronDown size={12} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                  : <ChevronRight size={12} style={{ marginLeft: 'auto', flexShrink: 0 }} />
              )}
            </button>

            {/* View result button */}
            {resultMessage && (
              <button
                className="flex items-center gap-1 px-2 py-1.5 rounded-r-lg transition-colors"
                style={{
                  color: 'var(--color-accent)',
                  borderLeft: '1px solid var(--color-border)',
                }}
                onClick={() => setShowResult(true)}
                title="View tool result"
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <FileText size={12} />
                <span className="text-xs">Result</span>
              </button>
            )}
          </div>

          {/* Collapsible args */}
          {expanded && payload?.args && (
            <div
              className="px-3 pb-2 font-mono whitespace-pre-wrap text-xs"
              style={{
                borderTop: '1px solid var(--color-border)',
                paddingTop: '6px',
                color: 'var(--color-text-secondary)',
              }}
            >
              {JSON.stringify(payload.args, null, 2)}
            </div>
          )}
        </div>
      </div>

      {showResult && resultMessage && (
        <ToolResultModal
          toolName={toolName}
          result={resultMessage.content}
          onClose={() => setShowResult(false)}
        />
      )}
    </>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message;
  isStreaming: boolean;
  conversationId: string;
}

function MessageBubble({ message, isStreaming, conversationId }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const replaceMessagesFrom = useAppStore((s) => s.replaceMessagesFrom);
  const addMessage = useAppStore((s) => s.addMessage);
  const setIsStreaming = useAppStore((s) => s.setIsStreaming);
  const appendStreamingContent = useAppStore((s) => s.appendStreamingContent);
  const resetStreamingContent = useAppStore((s) => s.resetStreamingContent);
  const loadConversations = useAppStore((s) => s.loadConversations);
  const setLastUsage = useAppStore((s) => s.setLastUsage);

  // Cancel any in-flight edit stream on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Auto-resize textarea when editing
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  const handleConfirmEdit = useCallback(() => {
    const newContent = editText.trim();
    if (!newContent || newContent === message.content) {
      setEditing(false);
      return;
    }

    // Optimistically replace from this message onward with the new user message
    const newUserMsg: Message = {
      id: message.id,
      conversation_id: conversationId,
      role: 'user',
      content: newContent,
      created_at: new Date().toISOString(),
    };
    replaceMessagesFrom(message.id, newUserMsg);
    setEditing(false);

    setIsStreaming(true);
    resetStreamingContent();

    abortRef.current = editMessage(
      { conversation_id: conversationId, message_id: message.id, new_content: newContent },
      (chunk) => {
        appendStreamingContent(chunk);
      },
      (fullText) => {
        setIsStreaming(false);
        addMessage({
          id: crypto.randomUUID(),
          conversation_id: conversationId,
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
          conversation_id: conversationId,
          role: 'assistant',
          content: `Error: ${error}`,
          created_at: new Date().toISOString(),
        });
        resetStreamingContent();
      },
      (toolUse) => {
        addMessage({
          id: toolUse.id,
          conversation_id: conversationId,
          role: 'tool_use',
          content: JSON.stringify({ tool: toolUse.tool, label: toolUse.label, args: toolUse.args, tool_call_id: toolUse.toolCallId }),
          created_at: new Date().toISOString(),
        });
      },
      (toolResult) => {
        addMessage({
          id: toolResult.msgId,
          conversation_id: conversationId,
          role: 'tool',
          content: '',
          name: toolResult.tool,
          tool_call_id: toolResult.toolCallId,
          created_at: new Date().toISOString(),
        });
      },
      undefined, // onAbort
      (usage) => {
        setLastUsage(usage);
      },
    );
  }, [
    editText, message.id, message.content, conversationId,
    replaceMessagesFrom, addMessage, setIsStreaming, appendStreamingContent,
    resetStreamingContent, loadConversations, setLastUsage,
  ]);

  const handleCancelEdit = useCallback(() => {
    setEditText(message.content);
    setEditing(false);
  }, [message.content]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirmEdit();
    }
    if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  // Inline edit mode for user messages
  if (isUser && editing) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] flex flex-col gap-1.5">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => {
              setEditText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            className="resize-none rounded-2xl rounded-br-md px-4 py-3 text-sm focus:outline-none focus:ring-2"
            style={{
              backgroundColor: 'var(--color-user-bubble)',
              color: 'var(--color-user-bubble-text)',
              minWidth: '200px',
              '--tw-ring-color': 'var(--color-border-focus)',
            } as React.CSSProperties}
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={handleCancelEdit}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <X size={11} />
              Cancel
            </button>
            <button
              onClick={handleConfirmEdit}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-text-inverse)',
              }}
            >
              <Check size={11} />
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={() => isUser && setHovered(true)}
      onMouseLeave={() => isUser && setHovered(false)}
    >
      {/* Edit button — only for user messages, shown on hover, hidden while streaming */}
      {isUser && (
        <button
          className="self-center mr-2 p-1 rounded-md transition-all"
          style={{
            opacity: hovered && !isStreaming ? 1 : 0,
            pointerEvents: hovered && !isStreaming ? 'auto' : 'none',
            color: 'var(--color-text-muted)',
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
          }}
          onClick={() => {
            setEditText(message.content);
            setEditing(true);
          }}
          title="Edit message"
        >
          <Pencil size={12} />
        </button>
      )}

      <div
        className={`max-w-[75%] px-4 py-3 text-sm leading-relaxed ${
          isUser ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'
        }`}
        style={{
          backgroundColor: isUser ? 'var(--color-user-bubble)' : 'var(--color-assistant-bubble)',
          color: isUser ? 'var(--color-user-bubble-text)' : 'var(--color-assistant-bubble-text)',
        }}
      >
        <MarkdownContent content={message.content} />
      </div>
    </div>
  );
}

// ─── Streaming bubble ─────────────────────────────────────────────────────────

function StreamingBubble({ content }: { content: string }) {
  if (!content) return null;
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[75%] px-4 py-3 rounded-2xl rounded-bl-md text-sm leading-relaxed"
        style={{
          backgroundColor: 'var(--color-assistant-bubble)',
          color: 'var(--color-assistant-bubble-text)',
        }}
      >
        <MarkdownContent content={content} />
        <span
          className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse rounded-sm align-middle"
          style={{ backgroundColor: 'var(--color-text-muted)' }}
        />
      </div>
    </div>
  );
}

// ─── Message list ─────────────────────────────────────────────────────────────

// How far from the bottom (px) the user must be before we stop auto-scrolling.
const SCROLL_THRESHOLD = 80;

export default function MessageList() {
  const messages = useAppStore((s) => s.activeMessages);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const streamingContent = useAppStore((s) => s.streamingContent);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the user is close enough to the bottom that we should follow new content.
  const isNearBottomRef = useRef(true);
  // Avoid scheduling more than one rAF at a time.
  const rafRef = useRef<number | null>(null);

  const scrollToBottom = useCallback((instant = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: instant ? 'instant' : 'smooth' });
  }, []);

  // Keep isNearBottomRef current as the user scrolls.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distFromBottom < SCROLL_THRESHOLD;
  }, []);

  // When streaming content grows, scroll only if already near bottom.
  // Use rAF so we batch rapid chunk updates and avoid fighting the user.
  useEffect(() => {
    if (!isStreaming) return;
    if (!isNearBottomRef.current) return;
    if (rafRef.current !== null) return; // already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (isNearBottomRef.current) scrollToBottom(true);
    });
  }, [streamingContent, isStreaming, scrollToBottom]);

  // When a new committed message arrives (sent/received), scroll if near bottom.
  useEffect(() => {
    if (isNearBottomRef.current) scrollToBottom(false);
  }, [messages.length, scrollToBottom]);

  // Jump to bottom instantly when switching conversations.
  const prevConvLengthRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length === 0 || prevConvLengthRef.current > messages.length) {
      // conversation cleared or switched
      isNearBottomRef.current = true;
      scrollToBottom(true);
    }
    prevConvLengthRef.current = messages.length;
  }, [messages.length, scrollToBottom]);

  // Build a map from tool_use message id → paired role="tool" message.
  // Match by tool_call_id stored in the tool_use payload, falling back to
  // positional matching (next role="tool" after the tool_use) for messages
  // loaded from DB that may predate the tool_call_id field.
  const toolResultMap = useCallback((): Map<string, Message> => {
    const map = new Map<string, Message>();
    const toolUseMessages = messages.filter((m) => m.role === 'tool_use');
    const toolResultMessages = messages.filter((m) => m.role === 'tool');

    // Build a lookup from tool_call_id → role="tool" message
    const byToolCallId = new Map<string, Message>();
    for (const tr of toolResultMessages) {
      if (tr.tool_call_id) byToolCallId.set(tr.tool_call_id, tr);
    }

    for (const tu of toolUseMessages) {
      // Try to extract tool_call_id from the stored payload JSON
      let tcid: string | undefined;
      try {
        const p = JSON.parse(tu.content) as { tool_call_id?: string };
        tcid = p.tool_call_id;
      } catch { /* ignore */ }

      if (tcid && byToolCallId.has(tcid)) {
        map.set(tu.id, byToolCallId.get(tcid)!);
      } else {
        // Fallback: positional — first role="tool" message after this tool_use
        const tuIndex = messages.indexOf(tu);
        const result = toolResultMessages.find((tr) => messages.indexOf(tr) > tuIndex);
        if (result) map.set(tu.id, result);
      }
    }
    return map;
  }, [messages]);

  const resultMap = toolResultMap();

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-6"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      <div className="max-w-3xl mx-auto space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="text-center mt-32" style={{ color: 'var(--color-text-muted)' }}>
            <p className="text-lg font-medium">Start a conversation</p>
            <p className="text-sm mt-1">Select a model and type a message below</p>
          </div>
        )}
        {messages.map((msg) => {
          // tool_use: render the card (with paired result)
          if (msg.role === 'tool_use') {
            return (
              <ToolUseCard
                key={msg.id}
                message={msg}
                resultMessage={resultMap.get(msg.id)}
              />
            );
          }
          // role="tool": hidden from the main flow (accessible via ToolUseCard)
          if (msg.role === 'tool') {
            return null;
          }
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              isStreaming={isStreaming}
              conversationId={activeConversationId ?? ''}
            />
          );
        })}
        {isStreaming && <StreamingBubble content={streamingContent} />}
      </div>
    </div>
  );
}
