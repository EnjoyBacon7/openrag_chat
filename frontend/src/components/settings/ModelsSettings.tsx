import { useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, RefreshCw, ChevronsDown } from 'lucide-react';
import { useAppStore } from '../../store';
import { modelsApi } from '../../api';
import type { ModelConfig, CreateModelRequest, UpdateModelRequest } from '../../types';

// ─── helpers ────────────────────────────────────────────────────────────────

function parseOptionalFloat(s: string): number | undefined {
  const n = parseFloat(s);
  return s.trim() === '' || isNaN(n) ? undefined : n;
}

function parseOptionalInt(s: string): number | undefined {
  const n = parseInt(s, 10);
  return s.trim() === '' || isNaN(n) ? undefined : n;
}

// ─── ModelForm ───────────────────────────────────────────────────────────────

interface FormData {
  name: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  systemPrompt: string;
  temperature: string;
  topP: string;
  maxTokens: string;
  presencePenalty: string;
  frequencyPenalty: string;
}

function ModelForm({
  initial,
  onSave,
  onCancel,
  onAddAll,
}: {
  initial?: ModelConfig;
  onSave: (data: CreateModelRequest | UpdateModelRequest) => Promise<void>;
  onCancel: () => void;
  onAddAll?: (items: CreateModelRequest[]) => Promise<void>;
}) {
  const [form, setForm] = useState<FormData>({
    name: initial?.name ?? '',
    baseUrl: initial?.base_url ?? '',
    apiKey: initial?.api_key ?? '',
    modelId: initial?.model_id ?? '',
    systemPrompt: initial?.system_prompt ?? '',
    temperature: initial?.temperature != null ? String(initial.temperature) : '',
    topP: initial?.top_p != null ? String(initial.top_p) : '',
    maxTokens: initial?.max_tokens != null ? String(initial.max_tokens) : '',
    presencePenalty: initial?.presence_penalty != null ? String(initial.presence_penalty) : '',
    frequencyPenalty: initial?.frequency_penalty != null ? String(initial.frequency_penalty) : '',
  });

  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(
    // Expand advanced section if any advanced field has a value
    !!(initial?.system_prompt || initial?.temperature != null || initial?.top_p != null ||
       initial?.max_tokens != null || initial?.presence_penalty != null || initial?.frequency_penalty != null)
  );
  const [saving, setSaving] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<string[] | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const handleDiscover = async () => {
    if (!form.baseUrl) return;
    setDiscovering(true);
    setDiscoverError(null);
    setDiscoveredModels(null);
    try {
      const ids = await modelsApi.discover(form.baseUrl, form.apiKey);
      setDiscoveredModels(ids);
      if (ids.length > 0 && form.modelId === '') {
        setForm((f) => ({ ...f, modelId: ids[0] }));
      }
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setDiscovering(false);
    }
  };

  const handleAddAll = async () => {
    if (!onAddAll || !discoveredModels || discoveredModels.length === 0) return;
    setAddingAll(true);
    try {
      const items: CreateModelRequest[] = discoveredModels.map((id) => ({
        name: id,
        base_url: form.baseUrl,
        api_key: form.apiKey,
        model_id: id,
      }));
      await onAddAll(items);
    } finally {
      setAddingAll(false);
    }
  };

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (initial) {
        // Build UpdateModelRequest with clear flags for fields that were cleared
        const wasTemp = initial.temperature != null;
        const wasTopP = initial.top_p != null;
        const wasMaxTok = initial.max_tokens != null;
        const wasPres = initial.presence_penalty != null;
        const wasFreq = initial.frequency_penalty != null;

        const newTemp = parseOptionalFloat(form.temperature);
        const newTopP = parseOptionalFloat(form.topP);
        const newMaxTok = parseOptionalInt(form.maxTokens);
        const newPres = parseOptionalFloat(form.presencePenalty);
        const newFreq = parseOptionalFloat(form.frequencyPenalty);

        const req: UpdateModelRequest = {
          name: form.name,
          base_url: form.baseUrl,
          api_key: form.apiKey,
          model_id: form.modelId,
          system_prompt: form.systemPrompt,
          temperature: newTemp,
          top_p: newTopP,
          max_tokens: newMaxTok,
          presence_penalty: newPres,
          frequency_penalty: newFreq,
          clear_temperature: wasTemp && newTemp == null,
          clear_top_p: wasTopP && newTopP == null,
          clear_max_tokens: wasMaxTok && newMaxTok == null,
          clear_presence_penalty: wasPres && newPres == null,
          clear_frequency_penalty: wasFreq && newFreq == null,
        };
        await onSave(req);
      } else {
        const req: CreateModelRequest = {
          name: form.name,
          base_url: form.baseUrl,
          api_key: form.apiKey,
          model_id: form.modelId,
          system_prompt: form.systemPrompt || undefined,
          temperature: parseOptionalFloat(form.temperature),
          top_p: parseOptionalFloat(form.topP),
          max_tokens: parseOptionalInt(form.maxTokens),
          presence_penalty: parseOptionalFloat(form.presencePenalty),
          frequency_penalty: parseOptionalFloat(form.frequencyPenalty),
        };
        await onSave(req);
      }
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-bg-primary)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
  };

  const labelStyle: React.CSSProperties = { color: 'var(--color-text-secondary)' };
  const hintStyle: React.CSSProperties = { color: 'var(--color-text-muted)' };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg p-4"
      style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      {/* ── Basic fields ── */}
      <div>
        <label className="block text-xs font-medium mb-1" style={labelStyle}>
          Display Name
        </label>
        <input
          type="text"
          value={form.name}
          onChange={set('name')}
          required
          placeholder="e.g. GPT-4o"
          className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={labelStyle}>
          Base URL
        </label>
        <input
          type="url"
          value={form.baseUrl}
          onChange={set('baseUrl')}
          required
          placeholder="https://api.openai.com/v1"
          className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1" style={labelStyle}>
          API Key
        </label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={form.apiKey}
            onChange={set('apiKey')}
            placeholder="sk-..."
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
      <div>
        <label className="block text-xs font-medium mb-1" style={labelStyle}>
          Model ID
        </label>
        <div className="flex gap-2">
          {discoveredModels && discoveredModels.length > 0 ? (
            <select
              value={form.modelId}
              onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))}
              required
              className="flex-1 px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
              style={inputStyle}
            >
              {discoveredModels.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={form.modelId}
              onChange={set('modelId')}
              required
              placeholder="e.g. gpt-4o"
              className="flex-1 px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
              style={inputStyle}
            />
          )}
          <button
            type="button"
            onClick={handleDiscover}
            disabled={!form.baseUrl || discovering}
            title={form.baseUrl ? 'Load available models from this endpoint' : 'Enter a Base URL first'}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg disabled:opacity-40 transition-colors flex-shrink-0"
            style={{
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <RefreshCw size={13} className={discovering ? 'animate-spin' : ''} />
            {discovering ? 'Loading…' : 'Load models'}
          </button>
        </div>
        {discoverError && (
          <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{discoverError}</p>
        )}
        {discoveredModels && discoveredModels.length === 0 && (
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>No models returned by this endpoint.</p>
        )}
        {onAddAll && discoveredModels && discoveredModels.length > 1 && (
          <button
            type="button"
            onClick={handleAddAll}
            disabled={addingAll}
            className="flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-40 transition-colors"
            style={{
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <ChevronsDown size={13} />
            {addingAll ? 'Adding…' : `Add all ${discoveredModels.length} models`}
          </button>
        )}
      </div>

      {/* ── Advanced settings toggle ── */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium py-1"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        Advanced settings
      </button>

      {showAdvanced && (
        <div className="space-y-3 pt-1">
          {/* System Prompt */}
          <div>
            <label className="block text-xs font-medium mb-1" style={labelStyle}>
              System Prompt
            </label>
            <textarea
              value={form.systemPrompt}
              onChange={set('systemPrompt')}
              rows={4}
              placeholder="You are a helpful assistant…"
              className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 resize-y"
              style={{ ...inputStyle, minHeight: '80px' }}
            />
          </div>

          {/* Numeric settings — 2-column grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={labelStyle}>
                Temperature
              </label>
              <input
                type="number"
                value={form.temperature}
                onChange={set('temperature')}
                min={0}
                max={2}
                step={0.01}
                placeholder="default"
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
                style={inputStyle}
              />
              <p className="text-xs mt-0.5" style={hintStyle}>0 – 2</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={labelStyle}>
                Top P
              </label>
              <input
                type="number"
                value={form.topP}
                onChange={set('topP')}
                min={0}
                max={1}
                step={0.01}
                placeholder="default"
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
                style={inputStyle}
              />
              <p className="text-xs mt-0.5" style={hintStyle}>0 – 1</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={labelStyle}>
                Max Tokens
              </label>
              <input
                type="number"
                value={form.maxTokens}
                onChange={set('maxTokens')}
                min={1}
                step={1}
                placeholder="default"
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
                style={inputStyle}
              />
              <p className="text-xs mt-0.5" style={hintStyle}>positive integer</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={labelStyle}>
                Presence Penalty
              </label>
              <input
                type="number"
                value={form.presencePenalty}
                onChange={set('presencePenalty')}
                min={-2}
                max={2}
                step={0.01}
                placeholder="default"
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
                style={inputStyle}
              />
              <p className="text-xs mt-0.5" style={hintStyle}>-2 – 2</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={labelStyle}>
                Frequency Penalty
              </label>
              <input
                type="number"
                value={form.frequencyPenalty}
                onChange={set('frequencyPenalty')}
                min={-2}
                max={2}
                step={0.01}
                placeholder="default"
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2"
                style={inputStyle}
              />
              <p className="text-xs mt-0.5" style={hintStyle}>-2 – 2</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-text-inverse)' }}
        >
          {saving ? 'Saving…' : initial ? 'Update' : 'Add Model'}
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

// ─── ModelsSettings ──────────────────────────────────────────────────────────

export default function ModelsSettings() {
  const models = useAppStore((s) => s.models);
  const loadModels = useAppStore((s) => s.loadModels);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ModelConfig | null>(null);

  const handleCreate = async (data: CreateModelRequest | UpdateModelRequest) => {
    await modelsApi.create(data as CreateModelRequest);
    setShowForm(false);
    loadModels();
  };

  const handleAddAll = async (items: CreateModelRequest[]) => {
    await Promise.all(items.map((item) => modelsApi.create(item)));
    setShowForm(false);
    loadModels();
  };

  const handleUpdate = async (data: CreateModelRequest | UpdateModelRequest) => {
    if (editing) {
      await modelsApi.update(editing.id, data as UpdateModelRequest);
      setEditing(null);
      loadModels();
    }
  };

  const handleDelete = async (id: string) => {
    await modelsApi.delete(id);
    loadModels();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Models
        </h3>
        {!showForm && !editing && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
            style={{
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Plus size={14} />
            Add Model
          </button>
        )}
      </div>

      {showForm && (
        <ModelForm onSave={handleCreate} onCancel={() => setShowForm(false)} onAddAll={handleAddAll} />
      )}

      {editing && (
        <ModelForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />
      )}

      <div className="space-y-2">
        {models.length === 0 && !showForm && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
            No models configured yet
          </p>
        )}
        {models.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between px-4 py-3 rounded-lg"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {m.name}
              </div>
              <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                {m.model_id} &middot; {m.base_url}
              </div>
              {/* Show a summary of any configured advanced settings */}
              {(m.system_prompt || m.temperature != null || m.top_p != null ||
                m.max_tokens != null || m.presence_penalty != null || m.frequency_penalty != null) && (
                <div className="flex flex-wrap gap-x-3 mt-1">
                  {m.system_prompt && (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      system prompt set
                    </span>
                  )}
                  {m.temperature != null && (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      temp={m.temperature}
                    </span>
                  )}
                  {m.top_p != null && (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      top_p={m.top_p}
                    </span>
                  )}
                  {m.max_tokens != null && (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      max_tokens={m.max_tokens}
                    </span>
                  )}
                  {m.presence_penalty != null && (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      pp={m.presence_penalty}
                    </span>
                  )}
                  {m.frequency_penalty != null && (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      fp={m.frequency_penalty}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 ml-3 flex-shrink-0">
              <button
                onClick={() => setEditing(m)}
                className="p-1.5 rounded transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => handleDelete(m.id)}
                className="p-1.5 rounded transition-colors"
                style={{ color: 'var(--color-text-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
