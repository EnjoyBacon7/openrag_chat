import { useNavigate } from 'react-router-dom';
import { useState, useRef, useCallback, useEffect } from 'react';
import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store';
import { conversationsApi } from '../../api';

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 260;
const SIDEBAR_WIDTH_KEY = 'sidebar-width';

function getSavedWidth(): number {
  try {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (n >= SIDEBAR_MIN_WIDTH && n <= SIDEBAR_MAX_WIDTH) return n;
    }
  } catch {}
  return SIDEBAR_DEFAULT_WIDTH;
}

export default function Sidebar() {
  const conversations = useAppStore((s) => s.conversations);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const loadConversations = useAppStore((s) => s.loadConversations);
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);
  const navigate = useNavigate();

  const [width, setWidth] = useState(getSavedWidth);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, startWidth.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Persist on release
      setWidth((w) => {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
        return w;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleNew = () => {
    setActiveConversation(null);
    navigate('/');
  };

  const handleSelect = (id: string) => {
    setActiveConversation(id);
    navigate(`/chat/${id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await conversationsApi.delete(id);
    if (activeConversationId === id) {
      setActiveConversation(null);
      navigate('/');
    }
    loadConversations();
  };

  return (
    <div className="relative flex-shrink-0 h-full flex" style={{ width }}>
      {/* Sidebar content */}
      <aside
        className="h-full flex flex-col flex-1 min-w-0"
        style={{
          backgroundColor: 'var(--color-sidebar-bg)',
          borderRight: '1px solid var(--color-border)',
        }}
      >
        {/* New chat button */}
        <div className="p-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <button
            onClick={handleNew}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{
              color: 'var(--color-text-primary)',
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-primary)')}
          >
            <MessageSquarePlus size={16} />
            New Chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-center mt-8" style={{ color: 'var(--color-text-muted)' }}>
              No conversations yet
            </p>
          )}
          {conversations.map((conv) => {
            const isActive = activeConversationId === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => handleSelect(conv.id)}
                className="group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors"
                style={{
                  backgroundColor: isActive ? 'var(--color-sidebar-active)' : 'transparent',
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span className="truncate flex-1">{conv.title}</span>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 transition-all"
                  style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize z-10 group"
        style={{ transform: 'translateX(50%)' }}
      >
        <div
          className="h-full w-0.5 mx-auto transition-colors group-hover:w-1 group-hover:rounded"
          style={{ backgroundColor: 'transparent' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent)')}
          onMouseLeave={(e) => {
            if (!isDragging.current) e.currentTarget.style.backgroundColor = 'transparent';
          }}
        />
      </div>
    </div>
  );
}
