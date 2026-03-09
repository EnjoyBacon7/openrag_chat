import { useAppStore } from '../../store';
import { themes } from '../../themes';

export default function ThemeSettings() {
  const themeId = useAppStore((s) => s.themeId);
  const setTheme = useAppStore((s) => s.setTheme);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        Theme
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {themes.map((t) => {
          const isSelected = t.id === themeId;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="rounded-xl p-3 transition-all text-left"
              style={{
                border: isSelected
                  ? `2px solid ${t.colors.accent}`
                  : '2px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-primary)',
              }}
            >
              {/* Color preview swatches */}
              <div className="flex gap-1.5 mb-2.5">
                <div
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: t.colors.bgPrimary, border: `1px solid ${t.colors.border}` }}
                />
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: t.colors.sidebarBg, border: `1px solid ${t.colors.border}` }} />
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: t.colors.userBubble }} />
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: t.colors.accent }} />
              </div>
              <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {t.name}
              </div>
              {isSelected && (
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Active
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
