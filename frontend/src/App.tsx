import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAppStore } from './store';
import { healthApi, mcpServersApi } from './api';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const loadModels = useAppStore((s) => s.loadModels);
  const loadMCPServers = useAppStore((s) => s.loadMCPServers);
  const loadConversations = useAppStore((s) => s.loadConversations);
  const addNotification = useAppStore((s) => s.addNotification);
  const models = useAppStore((s) => s.models);
  const mcpServers = useAppStore((s) => s.mcpServers);

  const hasRunDiagnosticsRef = useRef(false);

  // Bootstrap data
  useEffect(() => {
    loadModels();
    loadMCPServers();
    loadConversations();
  }, [loadModels, loadMCPServers, loadConversations]);

  // Diagnostic: backend health
  useEffect(() => {
    healthApi.check().then((ok) => {
      if (!ok) {
        addNotification({
          severity: 'error',
          title: 'Backend unreachable.',
          message: 'The server is not responding. Make sure the Go backend is running.',
        });
      }
    });
  }, [addNotification]);

  // Diagnostic: run once after models load
  useEffect(() => {
    if (models.length > 0 && !hasRunDiagnosticsRef.current) {
      hasRunDiagnosticsRef.current = true;

      // Check: no model configured
      if (models.length === 0) {
        addNotification({
          severity: 'warning',
          title: 'No model configured.',
          message: 'Add a model in Settings to start chatting.',
          actionLabel: 'Open Settings',
          actionRoute: '/settings',
        });
      }

      // Check: model missing API key
      const missing = models.filter((m) => !m.api_key || m.api_key.trim() === '');
      missing.forEach((m) => {
        addNotification({
          severity: 'warning',
          title: `Model "${m.name}" has no API key.`,
          message: 'Requests to this model will likely fail.',
          actionLabel: 'Open Settings',
          actionRoute: '/settings',
        });
      });

      // Check: MCP server reachability
      if (mcpServers.length > 0) {
        mcpServers.forEach((server) => {
          mcpServersApi.test(server.id).then((result) => {
            if (!result.success) {
              addNotification({
                severity: 'error',
                title: `MCP server "${server.name}" is unreachable.`,
                message: result.error ?? 'Could not connect to the MCP server.',
                actionLabel: 'Open Settings',
                actionRoute: '/settings',
              });
            }
          }).catch(() => {
            addNotification({
              severity: 'error',
              title: `MCP server "${server.name}" is unreachable.`,
              message: 'Could not connect to the MCP server.',
              actionLabel: 'Open Settings',
              actionRoute: '/settings',
            });
          });
        });
      }
    }
  }, [models, mcpServers, addNotification]);

  return (
    <Routes>
      <Route path="/" element={<ChatPage />} />
      <Route path="/chat/:conversationId" element={<ChatPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
