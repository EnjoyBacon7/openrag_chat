import { useNavigate } from 'react-router-dom';
import { Settings, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store';

export default function ChatHeader() {
  const models = useAppStore((s) => s.models);
  const mcpServers = useAppStore((s) => s.mcpServers);
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const selectedMCPServerId = useAppStore((s) => s.selectedMCPServerId);
  const setSelectedMCPServerId = useAppStore((s) => s.setSelectedMCPServerId);
  const navigate = useNavigate();

  const [modelOpen, setModelOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const mcpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
      if (mcpRef.current && !mcpRef.current.contains(e.target as Node)) {
        setMcpOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedModel = models.find((m) => m.id === selectedModelId);
  const selectedMCP = mcpServers.find((s) => s.id === selectedMCPServerId);

  const btnStyle: React.CSSProperties = {
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
  };

  const dropdownStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-bg-primary)',
    border: '1px solid var(--color-border)',
  };

  return (
    <header
      className="h-14 flex items-center justify-between px-4"
      style={{
        backgroundColor: 'var(--color-bg-primary)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-center gap-2">
        {/* Model selector */}
        <div className="relative" ref={modelRef}>
          <button
            onClick={() => setModelOpen(!modelOpen)}
            className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg transition-colors"
            style={btnStyle}
          >
            <span className="max-w-[160px] truncate">
              {selectedModel ? selectedModel.name : 'Select model'}
            </span>
            <ChevronDown size={14} />
          </button>
          {modelOpen && (
            <div
              className="absolute top-full left-0 mt-1 w-56 rounded-lg shadow-lg z-50 py-1"
              style={dropdownStyle}
            >
              {models.length === 0 ? (
                <p className="px-3 py-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  No models configured
                </p>
              ) : (
                models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedModelId(m.id);
                      setModelOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm transition-colors"
                    style={{
                      backgroundColor: m.id === selectedModelId ? 'var(--color-bg-tertiary)' : 'transparent',
                      color: 'var(--color-text-secondary)',
                      fontWeight: m.id === selectedModelId ? 500 : 400,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        m.id === selectedModelId ? 'var(--color-bg-tertiary)' : 'transparent')
                    }
                  >
                    <div className="truncate">{m.name}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                      {m.model_id}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* MCP Server selector */}
        <div className="relative" ref={mcpRef}>
          <button
            onClick={() => setMcpOpen(!mcpOpen)}
            className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg transition-colors"
            style={btnStyle}
          >
            <span className="max-w-[140px] truncate">
              {selectedMCP ? selectedMCP.name : 'No MCP'}
            </span>
            <ChevronDown size={14} />
          </button>
          {mcpOpen && (
            <div
              className="absolute top-full left-0 mt-1 w-48 rounded-lg shadow-lg z-50 py-1"
              style={dropdownStyle}
            >
              <button
                onClick={() => {
                  setSelectedMCPServerId(null);
                  setMcpOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm transition-colors"
                style={{
                  backgroundColor: !selectedMCPServerId ? 'var(--color-bg-tertiary)' : 'transparent',
                  color: 'var(--color-text-secondary)',
                  fontWeight: !selectedMCPServerId ? 500 : 400,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)')}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    !selectedMCPServerId ? 'var(--color-bg-tertiary)' : 'transparent')
                }
              >
                None
              </button>
              {mcpServers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedMCPServerId(s.id);
                    setMcpOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm transition-colors"
                  style={{
                    backgroundColor: s.id === selectedMCPServerId ? 'var(--color-bg-tertiary)' : 'transparent',
                    color: 'var(--color-text-secondary)',
                    fontWeight: s.id === selectedMCPServerId ? 500 : 400,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      s.id === selectedMCPServerId ? 'var(--color-bg-tertiary)' : 'transparent')
                  }
                >
                  <div className="truncate">{s.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => navigate('/settings')}
        className="p-2 rounded-lg transition-colors"
        style={{ color: 'var(--color-text-muted)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--color-text-secondary)';
          e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--color-text-muted)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Settings size={18} />
      </button>
    </header>
  );
}
