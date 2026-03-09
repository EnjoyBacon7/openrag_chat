import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ModelsSettings from '../components/settings/ModelsSettings';
import MCPServersSettings from '../components/settings/MCPServersSettings';
import ThemeSettings from '../components/settings/ThemeSettings';

type Tab = 'models' | 'mcp' | 'theme';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('models');
  const navigate = useNavigate();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'models', label: 'Models' },
    { id: 'mcp', label: 'MCP Servers' },
    { id: 'theme', label: 'Theme' },
  ];

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      {/* Header */}
      <header
        className="h-14 flex items-center px-4 gap-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <button
          onClick={() => navigate('/')}
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
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Settings
        </h1>
      </header>

      {/* Tabs */}
      <div className="px-6" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="py-3 text-sm font-medium transition-colors"
              style={{
                color: tab === t.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                borderBottom: tab === t.id ? '2px solid var(--color-accent)' : '2px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {tab === 'models' && <ModelsSettings />}
          {tab === 'mcp' && <MCPServersSettings />}
          {tab === 'theme' && <ThemeSettings />}
        </div>
      </div>
    </div>
  );
}
