import { useEffect, useState } from 'react';
import { commandsApi, CommandConfig } from '../services/api';

interface ServerGroup {
  server: {
    id: number;
    public_id: string;
    guild_id: string;
    guild_name: string;
    bot_configured: boolean;
    mirror_webhook_configured: boolean;
  };
  configs: CommandConfig[];
}

function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="toggle" style={{ cursor: 'pointer' }}>
      <div
        className={`toggle-track ${value ? 'on' : ''}`}
        onClick={() => onChange(!value)}
      >
        <div className="toggle-thumb" />
      </div>
      <span className="toggle-label">{label}</span>
    </label>
  );
}

export default function CommandsPage() {
  const [groups, setGroups] = useState<ServerGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    commandsApi.list().then(res => {
      if (res.success && res.data) {
        setGroups(res.data as unknown as ServerGroup[]);
      }
      setIsLoading(false);
    });
  }, []);

  async function handleUpdate(
    config: CommandConfig,
    updates: Partial<CommandConfig>,
  ) {
    const updated = { ...config, ...updates };

    // Optimistic UI update
    setGroups(prev =>
      prev.map(g => ({
        ...g,
        configs: g.configs.map(c => c.public_id === config.public_id ? updated : c),
      })),
    );

    try {
      await commandsApi.update(config.public_id, updates);
      setSaved(config.public_id);
      setTimeout(() => setSaved(null), 2000);
    } catch {
      // Revert on failure
      setGroups(prev =>
        prev.map(g => ({
          ...g,
          configs: g.configs.map(c => c.public_id === config.public_id ? config : c),
        })),
      );
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
        <h1 className="page-title">Command Configuration</h1>
        <p className="page-subtitle">Configure the behavior of each slash command per server</p>
      </div>

      {groups.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">⌨️</div>
            <div className="empty-title">No servers configured</div>
            <div className="empty-text">Connect a Discord server in Settings to configure commands</div>
          </div>
        </div>
      ) : (
        groups.map(group => (
          <div key={group.server.public_id} style={{ marginBottom: 32 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
            }}>
              <div style={{
                width: 36, height: 36, background: 'var(--color-primary)',
                borderRadius: 'var(--radius-md)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>🔷</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text)' }}>
                  {group.server.guild_name}
                </div>
                <div className="mono text-muted">{group.server.guild_id}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {group.configs.map(config => (
                <div key={config.public_id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600,
                        color: 'var(--color-primary)', marginBottom: 4,
                      }}>
                        /{config.command_name}
                      </div>
                      {saved === config.public_id && (
                        <span style={{ fontSize: 12, color: 'var(--color-accent)' }}>✓ Saved</span>
                      )}
                    </div>
                    <Toggle
                      value={config.enabled}
                      onChange={v => handleUpdate(config, { enabled: v })}
                      label={config.enabled ? 'Enabled' : 'Disabled'}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Response Template</label>
                    <textarea
                      className="form-textarea"
                      value={config.response_template}
                      onChange={e => {
                        const val = e.target.value;
                        setGroups(prev =>
                          prev.map(g => ({
                            ...g,
                            configs: g.configs.map(c =>
                              c.public_id === config.public_id
                                ? { ...c, response_template: val }
                                : c,
                            ),
                          })),
                        );
                      }}
                      onBlur={() => handleUpdate(config, { response_template: config.response_template })}
                      placeholder={`Enter response template for /${config.command_name}`}
                    />
                    {config.command_name === 'report' && (
                      <p style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 6 }}>
                        Use {'{{text}}'} to include the user's report text.
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <Toggle
                      value={config.mirror_enabled}
                      onChange={v => handleUpdate(config, { mirror_enabled: v })}
                      label="Mirror to webhook"
                    />
                    <Toggle
                      value={config.ai_enabled}
                      onChange={v => handleUpdate(config, { ai_enabled: v })}
                      label="AI processing"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
