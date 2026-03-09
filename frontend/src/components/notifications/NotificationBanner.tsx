import { useNavigate } from 'react-router-dom';
import { AlertTriangle, AlertCircle, Info, X, ExternalLink } from 'lucide-react';
import { useAppStore, type AppNotification, type NotificationSeverity } from '../../store';

const SEVERITY_STYLES: Record<
  NotificationSeverity,
  { bg: string; border: string; icon: string; text: string; iconEl: typeof AlertTriangle }
> = {
  error: {
    bg: 'var(--color-notification-error-bg, #fef2f2)',
    border: 'var(--color-notification-error-border, #fecaca)',
    icon: '#b91c1c',
    text: '#b91c1c',
    iconEl: AlertCircle,
  },
  warning: {
    bg: 'var(--color-notification-warning-bg, #fffbeb)',
    border: 'var(--color-notification-warning-border, #fde68a)',
    icon: '#92400e',
    text: '#92400e',
    iconEl: AlertTriangle,
  },
  info: {
    bg: 'var(--color-bg-secondary)',
    border: 'var(--color-border)',
    icon: 'var(--color-accent)',
    text: 'var(--color-text-secondary)',
    iconEl: Info,
  },
};

function NotificationCard({ n }: { n: AppNotification }) {
  const dismiss = useAppStore((s) => s.dismissNotification);
  const navigate = useNavigate();
  const style = SEVERITY_STYLES[n.severity];
  const Icon = style.iconEl;

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 text-sm"
      style={{
        backgroundColor: style.bg,
        borderBottom: `1px solid ${style.border}`,
      }}
    >
      <Icon size={16} style={{ color: style.icon, flexShrink: 0, marginTop: 1 }} />
      <div className="flex-1 min-w-0">
        <span className="font-semibold" style={{ color: style.text }}>
          {n.title}
        </span>
        {' '}
        <span style={{ color: style.text, opacity: 0.85 }}>{n.message}</span>
        {n.actionLabel && n.actionRoute && (
          <button
            onClick={() => navigate(n.actionRoute!)}
            className="ml-2 inline-flex items-center gap-1 underline underline-offset-2 font-medium"
            style={{ color: style.icon }}
          >
            {n.actionLabel}
            <ExternalLink size={12} />
          </button>
        )}
      </div>
      <button
        onClick={() => dismiss(n.id)}
        className="flex-shrink-0 p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
        style={{ color: style.icon }}
        title="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function NotificationBanner() {
  const notifications = useAppStore((s) => s.notifications);
  if (notifications.length === 0) return null;

  return (
    <div className="flex flex-col">
      {notifications.map((n) => (
        <NotificationCard key={n.id} n={n} />
      ))}
    </div>
  );
}
