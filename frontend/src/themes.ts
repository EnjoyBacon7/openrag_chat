export interface Theme {
  id: string;
  name: string;
  colors: {
    // Backgrounds
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    bgInput: string;
    // Borders
    border: string;
    borderFocus: string;
    // Text
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    textInverse: string;
    // Accent (buttons, active states)
    accent: string;
    accentHover: string;
    // User message bubble
    userBubble: string;
    userBubbleText: string;
    // Assistant message bubble
    assistantBubble: string;
    assistantBubbleText: string;
    // Sidebar
    sidebarBg: string;
    sidebarActive: string;
    sidebarHover: string;
  };
}

export const themes: Theme[] = [
  {
    id: 'light',
    name: 'Light',
    colors: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f8fafc',
      bgTertiary: '#f1f5f9',
      bgInput: '#f8fafc',
      border: '#e2e8f0',
      borderFocus: '#cbd5e1',
      textPrimary: '#1e293b',
      textSecondary: '#475569',
      textMuted: '#94a3b8',
      textInverse: '#ffffff',
      accent: '#1e293b',
      accentHover: '#334155',
      userBubble: '#1e293b',
      userBubbleText: '#ffffff',
      assistantBubble: '#f1f5f9',
      assistantBubbleText: '#1e293b',
      sidebarBg: '#f8fafc',
      sidebarActive: '#e2e8f0',
      sidebarHover: '#f1f5f9',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    colors: {
      bgPrimary: '#0f172a',
      bgSecondary: '#1e293b',
      bgTertiary: '#334155',
      bgInput: '#1e293b',
      border: '#334155',
      borderFocus: '#475569',
      textPrimary: '#f1f5f9',
      textSecondary: '#cbd5e1',
      textMuted: '#64748b',
      textInverse: '#0f172a',
      accent: '#e2e8f0',
      accentHover: '#cbd5e1',
      userBubble: '#3b82f6',
      userBubbleText: '#ffffff',
      assistantBubble: '#1e293b',
      assistantBubbleText: '#e2e8f0',
      sidebarBg: '#1e293b',
      sidebarActive: '#334155',
      sidebarHover: '#293548',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    colors: {
      bgPrimary: '#2e3440',
      bgSecondary: '#3b4252',
      bgTertiary: '#434c5e',
      bgInput: '#3b4252',
      border: '#4c566a',
      borderFocus: '#5e6779',
      textPrimary: '#eceff4',
      textSecondary: '#d8dee9',
      textMuted: '#7b88a1',
      textInverse: '#2e3440',
      accent: '#88c0d0',
      accentHover: '#7eb8c8',
      userBubble: '#5e81ac',
      userBubbleText: '#eceff4',
      assistantBubble: '#3b4252',
      assistantBubbleText: '#d8dee9',
      sidebarBg: '#3b4252',
      sidebarActive: '#434c5e',
      sidebarHover: '#3f4758',
    },
  },
  {
    id: 'rose',
    name: 'Rose',
    colors: {
      bgPrimary: '#fff1f2',
      bgSecondary: '#ffe4e6',
      bgTertiary: '#fecdd3',
      bgInput: '#fff1f2',
      border: '#fecdd3',
      borderFocus: '#fda4af',
      textPrimary: '#881337',
      textSecondary: '#9f1239',
      textMuted: '#be123c',
      textInverse: '#ffffff',
      accent: '#be123c',
      accentHover: '#9f1239',
      userBubble: '#be123c',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffe4e6',
      assistantBubbleText: '#881337',
      sidebarBg: '#ffe4e6',
      sidebarActive: '#fecdd3',
      sidebarHover: '#ffd6d9',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: {
      bgPrimary: '#f0fdf4',
      bgSecondary: '#dcfce7',
      bgTertiary: '#bbf7d0',
      bgInput: '#f0fdf4',
      border: '#bbf7d0',
      borderFocus: '#86efac',
      textPrimary: '#14532d',
      textSecondary: '#166534',
      textMuted: '#15803d',
      textInverse: '#ffffff',
      accent: '#166534',
      accentHover: '#14532d',
      userBubble: '#166534',
      userBubbleText: '#ffffff',
      assistantBubble: '#dcfce7',
      assistantBubbleText: '#14532d',
      sidebarBg: '#dcfce7',
      sidebarActive: '#bbf7d0',
      sidebarHover: '#caf5db',
    },
  },
];

export function getTheme(id: string): Theme {
  return themes.find((t) => t.id === id) || themes[0];
}
