import { useEffect, useState } from 'react';
import { dashboardApi, Interaction, ActionLog } from '../services/api';

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
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function InteractionDetail({
  interaction,
  actionLogs,
  onClose,
}: {
  interaction: Interaction;
  actionLogs: ActionLog[];
  onClose: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: 24,
    }}>
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)', padding: 32, maxWidth: 640, width: '100%',
        maxHeight: '80vh', overflow: 'auto',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Interaction Details</h2>
          <button
            id="close-detail-btn"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 20 }}
          >✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {[
            ['Command', `/${interaction.command_name}`],
            ['User', interaction.username ?? '—'],
            ['Status', <StatusBadge key="s" status={interaction.status} />],
            ['Response', interaction.response_status ? <StatusBadge key="r" status={interaction.response_status} /> : '—'],
            ['Mirror', interaction.mirror_status ? <StatusBadge key="m" status={interaction.mirror_status} /> : '—'],
            ['Received', formatTime(interaction.received_at)],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ padding: '12px 16px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 13 }}>{value}</div>
            </div>
          ))}
        </div>

        {interaction.input_text && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 8 }}>INPUT</div>
            <div style={{
              background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', padding: 14, fontSize: 13,
              fontFamily: 'var(--font-mono)',
            }}>
              {interaction.input_text}
            </div>
          </div>
        )}

        {interaction.error_message && (
          <div className="alert danger" style={{ marginBottom: 24 }}>
            <span className="alert-icon">⚠️</span>
            {interaction.error_message}
          </div>
        )}

        {actionLogs.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Action Log</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actionLogs.map(log => (
                <div key={log.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 14px', background: 'var(--color-surface-2)',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                }}>
                  <StatusBadge status={log.status} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text)' }}>
                      {log.action_type}
                    </div>
                    {log.error_message && (
                      <div style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 4 }}>
                        {log.error_message}
                      </div>
                    )}
                  </div>
                  <div className="mono" style={{ fontSize: 11 }}>
                    {new Date(log.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InteractionsPage() {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<{ interaction: Interaction; actionLogs: ActionLog[] } | null>(null);
  const limit = 25;

  useEffect(() => {
    setIsLoading(true);
    dashboardApi.listInteractions(page, limit).then(res => {
      if (res.success && res.data) {
        setInteractions(res.data as unknown as Interaction[]);
        setTotal(res.total ?? 0);
      }
      setIsLoading(false);
    });
  }, [page]);

  async function handleRowClick(interaction: Interaction) {
    const res = await dashboardApi.getInteraction(interaction.id);
    if (res.success && res.data) {
      setSelected(res.data as unknown as { interaction: Interaction; actionLogs: ActionLog[] });
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Interactions</h1>
        <p className="page-subtitle">Full history of all Discord slash command interactions</p>
      </div>

      {isLoading ? (
        <div className="loading-page">
          <div className="loading-spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : interactions.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">⚡</div>
            <div className="empty-title">No interactions yet</div>
            <div className="empty-text">Run a slash command in Discord to see it here</div>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
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
                  <tr key={i.id} onClick={() => handleRowClick(i)} title="Click for details">
                    <td className="mono">{i.id}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {new Date(i.received_at).toLocaleString(undefined, {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontSize: 13 }}>
                        /{i.command_name}
                      </span>
                    </td>
                    <td>{i.username ?? '—'}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <div className="text-muted">Showing {interactions.length} of {total} interactions</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                ← Prev
              </button>
              <span style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--color-text-muted)', padding: '0 8px' }}>
                {page} / {totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

      {selected && (
        <InteractionDetail
          interaction={selected.interaction}
          actionLogs={selected.actionLogs}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
