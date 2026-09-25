import React, { useEffect, useState } from 'react';
import { discordApi, DiscordServer } from '../services/api';

export default function SettingsPage() {
  const [servers, setServers] = useState<DiscordServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [guildId, setGuildId] = useState('');
  const [guildName, setGuildName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    discordApi.getServers().then(res => {
      if (res.success && res.data) setServers(res.data);
      setIsLoading(false);
    });
  }, []);

  async function handleConnectServer(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    try {
      const res = await discordApi.connectServer(guildId.trim(), guildName.trim());
      if (res.success && res.data) {
        setServers(prev => {
          const existing = prev.findIndex(s => s.guild_id === res.data!.guild_id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = res.data!;
            return updated;
          }
          return [...prev, res.data!];
        });
        setGuildId('');
        setGuildName('');
        setMessage({ type: 'success', text: 'Server connected successfully!' });
      } else {
        setMessage({ type: 'error', text: res.error ?? 'Failed to connect server' });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedServerId) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const res = await discordApi.updateServer(selectedServerId, {
        mirror_webhook_url: webhookUrl.trim() || null,
      });
      if (res.success) {
        setServers(prev =>
          prev.map(s => s.public_id === selectedServerId && res.data
            ? res.data
            : s,
          ),
        );
        setWebhookUrl('');
        setSelectedServerId(null);
        setMessage({ type: 'success', text: 'Mirror webhook configured successfully!' });
      } else {
        setMessage({ type: 'error', text: res.error ?? 'Failed to configure webhook' });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegisterCommands(serverId: string | undefined) {
    setMessage(null);
    try {
      const server = servers.find(s => s.public_id === serverId);
      const res = await discordApi.registerCommands(server?.guild_id);
      if (res.success) {
        setMessage({ type: 'success', text: 'Slash commands registered successfully!' });
      } else {
        setMessage({ type: 'error', text: (res as { error?: string }).error ?? 'Failed to register commands' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to register commands' });
    }
  }

  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="loading-spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure Discord server connections and webhooks</p>
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'success' : 'danger'}`}>
          <span className="alert-icon">{message.type === 'success' ? '✅' : '⚠️'}</span>
          {message.text}
        </div>
      )}

      {/* Connected Servers */}
      {servers.length > 0 && (
        <div className="card mb-24">
          <div className="card-title">Connected Servers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {servers.map(server => (
              <div key={server.public_id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, background: 'var(--color-primary)',
                    borderRadius: 'var(--radius-sm)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 14,
                  }}>🔷</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>
                      {server.guild_name}
                    </div>
                    <div className="mono text-muted">{server.guild_id}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`badge ${server.mirror_webhook_configured ? 'success' : 'muted'}`}>
                    <span className="badge-dot" />
                    Mirror: {server.mirror_webhook_configured ? 'Configured' : 'Not set'}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedServerId(server.public_id)}
                  >
                    Set webhook
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleRegisterCommands(server.public_id)}
                  >
                    Register commands
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Connect Server */}
        <div className="card">
          <div className="card-title">Connect Discord Server</div>
          <div className="alert info" style={{ marginBottom: 16 }}>
            <span className="alert-icon">ℹ️</span>
            <span>Enter your Discord server (guild) ID and name. You can find the guild ID by right-clicking your server in Discord with Developer Mode enabled.</span>
          </div>
          <form onSubmit={handleConnectServer} id="connect-server-form">
            <div className="form-group">
              <label className="form-label" htmlFor="guild-id">Guild ID</label>
              <input
                id="guild-id"
                type="text"
                className="form-input"
                value={guildId}
                onChange={e => setGuildId(e.target.value)}
                placeholder="123456789012345678"
                required
                pattern="\d{17,20}"
                title="Discord server ID (17-20 digits)"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="guild-name">Server Name</label>
              <input
                id="guild-name"
                type="text"
                className="form-input"
                value={guildName}
                onChange={e => setGuildName(e.target.value)}
                placeholder="My Discord Server"
                required
              />
            </div>
            <button
              id="connect-server-btn"
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Connecting…' : 'Connect Server'}
            </button>
          </form>
        </div>

        {/* Configure Webhook */}
        <div className="card">
          <div className="card-title">Configure Mirror Webhook</div>
          <div className="alert warning" style={{ marginBottom: 16 }}>
            <span className="alert-icon">🔒</span>
            <span>The webhook URL is stored securely server-side and never returned to this dashboard after saving.</span>
          </div>
          <form onSubmit={handleSetWebhook} id="webhook-form">
            <div className="form-group">
              <label className="form-label" htmlFor="webhook-server">Server</label>
              <select
                id="webhook-server"
                className="form-select"
                value={selectedServerId ?? ''}
                onChange={e => setSelectedServerId(e.target.value || null)}
                required
              >
                <option value="">Select a server…</option>
                {servers.map(s => (
                  <option key={s.public_id} value={s.public_id}>
                    {s.guild_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="webhook-url">Webhook URL</label>
              <input
                id="webhook-url"
                type="url"
                className="form-input"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                required={selectedServerId !== null}
              />
            </div>
            <button
              id="save-webhook-btn"
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !selectedServerId}
            >
              {isSubmitting ? 'Saving…' : 'Save Webhook'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
