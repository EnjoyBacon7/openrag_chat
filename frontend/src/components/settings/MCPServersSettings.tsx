import { useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, Plug, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import { mcpServersApi } from '../../api';
import type { MCPServer, CreateMCPServerRequest } from '../../types';

type TestResult = {
  id: string;
  success: boolean;
  tools?: number;
  tool_list?: Array<{ name: string; description: string }>;
  error?: string;
};

function MCPForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: MCPServer;
  onSave: (data: CreateMCPServerRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [url, setUrl] = useState(initial?.url || '');
  const [apiKey, setApiKey] = useState(initial?.api_key || '');
  const [transport, setTransport] = useState<'streamable-http' | 'sse'>(initial?.transport || 'streamable-http');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, url, api_key: apiKey || undefined, transport });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-bg-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg p-4"
      style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          Display Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Local MCP Server"
          className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          placeholder="http://localhost:8080/mcp/"
          className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          Transport
        </label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="transport"
              value="streamable-http"
              checked={transport === 'streamable-http'}
              onChange={() => setTransport('streamable-http')}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Streamable HTTP</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="transport"
              value="sse"
              checked={transport === 'sse'}
              onChange={() => setTransport('sse')}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>SSE</span>
          </label>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          API Key (optional)
        </label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Leave empty if not required"
            className="w-full px-3 py-2 pr-10 text-sm rounded-lg focus:outline-none focus:ring-2"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-inverse)' }}
        >
          {saving ? 'Saving...' : initial ? 'Update' : 'Add Server'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg transition-colors"
          style={{
            color: 'var(--color-text-secondary)',
            backgroundColor: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function TestResultPanel({ result }: { result: TestResult }) {
  const [toolsExpanded, setToolsExpanded] = useState(false);

  if (!result.success) {
    return (
      <div
        className="mt-1 px-3 py-2 rounded-lg text-xs flex items-center gap-1.5"
        style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}
      >
        <XCircle size={12} />
        Failed: {result.error}
      </div>
    );
  }

  const tools = result.tool_list ?? [];

  return (
    <div
      className="mt-1 rounded-lg text-xs overflow-hidden"
      style={{ border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4' }}
    >
      {/* Summary row */}
      <button
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left"
        style={{ color: '#15803d', cursor: tools.length > 0 ? 'pointer' : 'default' }}
        onClick={() => tools.length > 0 && setToolsExpanded((v) => !v)}
        disabled={tools.length === 0}
      >
        <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
        <span className="font-medium">
          Connected — {tools.length} tool{tools.length !== 1 ? 's' : ''} available
        </span>
        {tools.length > 0 && (
          toolsExpanded
            ? <ChevronDown size={12} style={{ marginLeft: 'auto' }} />
            : <ChevronRight size={12} style={{ marginLeft: 'auto' }} />
        )}
      </button>

      {/* Tool list */}
      {toolsExpanded && tools.length > 0 && (
        <div
          className="px-3 pb-2 space-y-1.5"
          style={{ borderTop: '1px solid #bbf7d0' }}
        >
          {tools.map((t) => (
            <div key={t.name} className="pt-1.5">
              <span className="font-mono font-semibold" style={{ color: '#166534' }}>{t.name}</span>
              {t.description && (
                <p className="mt-0.5" style={{ color: '#15803d' }}>{t.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MCPServersSettings() {
  const mcpServers = useAppStore((s) => s.mcpServers);
  const loadMCPServers = useAppStore((s) => s.loadMCPServers);
  const [showForm, setShowForm] = useState(false);
  // editingId: which server card is currently showing its edit form inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const handleCreate = async (data: CreateMCPServerRequest) => {
    await mcpServersApi.create(data);
    setShowForm(false);
    loadMCPServers();
  };

  const handleUpdate = async (id: string, data: CreateMCPServerRequest) => {
    await mcpServersApi.update(id, data);
    setEditingId(null);
    loadMCPServers();
  };

  const handleDelete = async (id: string) => {
    await mcpServersApi.delete(id);
    if (editingId === id) setEditingId(null);
    setTestResults((prev) => { const next = { ...prev }; delete next[id]; return next; });
    loadMCPServers();
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    setTestResults((prev) => { const next = { ...prev }; delete next[id]; return next; });
    try {
      const result = await mcpServersApi.test(id);
      setTestResults((prev) => ({ ...prev, [id]: { id, ...result } }));
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [id]: { id, success: false, error: String(err) } }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          MCP Servers
        </h3>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
            style={{
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Plus size={14} />
            Add Server
          </button>
        )}
      </div>

      {showForm && (
        <MCPForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      <div className="space-y-2">
        {mcpServers.length === 0 && !showForm && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
            No MCP servers configured yet
          </p>
        )}
        {mcpServers.map((s) =>
          editingId === s.id ? (
            // ── Inline edit form replaces the card ──
            <MCPForm
              key={s.id}
              initial={s}
              onSave={(data) => handleUpdate(s.id, data)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            // ── Normal card ──
            <div key={s.id}>
              <div
                className="flex items-center justify-between px-4 py-3 rounded-lg"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {s.name}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {s.url}
                    <span
                      className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase"
                      style={{
                        backgroundColor: 'var(--color-bg-tertiary)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {s.transport || 'streamable-http'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleTest(s.id)}
                    disabled={testing === s.id}
                    className="p-1.5 rounded transition-colors disabled:opacity-50"
                    title="Test connection"
                    style={{ color: 'var(--color-text-muted)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#3b82f6')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                  >
                    {testing === s.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Plug size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => { setEditingId(s.id); setShowForm(false); }}
                    className="p-1.5 rounded transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-1.5 rounded transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {testResults[s.id] && <TestResultPanel result={testResults[s.id]} />}
            </div>
          )
        )}
      </div>
    </div>
  );
}
