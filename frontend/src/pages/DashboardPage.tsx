import { useEffect, useState } from 'react';
import { dashboardApi } from '../services/api';

interface Stats {
  total: number;
  completed: number;
  failed: number;
  duplicate: number;
  byCommand: Array<{ command_name: string; count: number }>;
}

interface Interaction {
  id: number;
  command_name: string;
  username: string | null;
  input_text: string | null;
  status: string;
  response_status: string | null;
  mirror_status: string | null;
  received_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const cls = ['completed', 'sent', 'success'].includes(status) ? 'success'
    : ['failed', 'danger'].includes(status) ? 'failed'
    : status === 'duplicate' ? 'duplicate'
    : status === 'skipped' ? 'skipped'
    : 'pending';

  return (
    <span className={`badge ${cls}`}>
      <span className="badge-dot" />
      {status}
    </span>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, intRes] = await Promise.all([
          dashboardApi.getStats(),
          dashboardApi.listInteractions(1, 20),
        ]);
        if (statsRes.success && statsRes.data) setStats(statsRes.data);
        if (intRes.success && intRes.data)
          setInteractions(intRes.data as unknown as Interaction[]);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="loading-spinner" style={{ width: 32, height: 32 }} />
        <div className="loading-text">Loading dashboard…</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Overview of your Discord bot activity</p>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">📊</span>
          <div className="stat-label">Total Commands</div>
          <div className="stat-value primary">{stats?.total ?? 0}</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">✅</span>
          <div className="stat-label">Successful</div>
          <div className="stat-value success">{stats?.completed ?? 0}</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">❌</span>
          <div className="stat-label">Failed</div>
          <div className="stat-value danger">{stats?.failed ?? 0}</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🔁</span>
          <div className="stat-label">Duplicates</div>
          <div className="stat-value warning">{stats?.duplicate ?? 0}</div>
        </div>
      </div>

      {/* Command Breakdown */}
      {stats && stats.byCommand.length > 0 && (
        <div className="card mb-32">
          <div className="card-title">Command Breakdown</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {stats.byCommand.map(cmd => (
              <div key={cmd.command_name} style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-primary)' }}>
                  /{cmd.command_name}
                </span>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>
                  {cmd.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Interactions */}
      <div className="card">
        <div className="card-title">Recent Interactions</div>
        {interactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⚡</div>
            <div className="empty-title">No interactions yet</div>
            <div className="empty-text">Run a slash command in Discord to see activity here</div>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Command</th>
                  <th>User</th>
                  <th>Input</th>
                  <th>Status</th>
                  <th>Response</th>
                  <th>Mirror</th>
                </tr>
              </thead>
              <tbody>
                {interactions.map(i => (
                  <tr key={i.id}>
                    <td className="mono">{formatTime(i.received_at)}</td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontSize: 13 }}>
                        /{i.command_name}
                      </span>
                    </td>
                    <td>{i.username ?? '—'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {i.input_text ?? '—'}
                    </td>
                    <td><StatusBadge status={i.status} /></td>
                    <td>{i.response_status ? <StatusBadge status={i.response_status} /> : '—'}</td>
                    <td>{i.mirror_status ? <StatusBadge status={i.mirror_status} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
