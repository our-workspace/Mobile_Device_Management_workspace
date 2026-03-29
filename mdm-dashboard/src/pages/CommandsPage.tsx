// src/pages/CommandsPage.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { commandsApi } from '../services/api';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  QUEUED: 'Queued',
  SENT: 'Sent',
  IN_PROGRESS: 'In Progress',
  SUCCESS: 'Success',
  FAILURE: 'Failed',
  TIMEOUT: 'Timeout',
};

const STATUS_FILTER_OPTIONS = ['ALL', 'PENDING', 'QUEUED', 'SENT', 'IN_PROGRESS', 'SUCCESS', 'FAILURE', 'TIMEOUT'];

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
}

function timeDiff(start: string, end: string | null | undefined) {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function CommandsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [limit, setLimit] = useState(100);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['audit-log', limit],
    queryFn: () => commandsApi.getAuditLog(limit).then((r) => r.data),
    refetchInterval: 10_000,
  });

  const allCommands: any[] = data?.commands ?? [];

  const commands = statusFilter === 'ALL'
    ? allCommands
    : allCommands.filter((c) => c.status === statusFilter);

  // إحصائيات
  const stats = {
    total: allCommands.length,
    success: allCommands.filter((c) => c.status === 'SUCCESS').length,
    failed: allCommands.filter((c) => c.status === 'FAILURE' || c.status === 'TIMEOUT').length,
    pending: allCommands.filter((c) => ['PENDING', 'QUEUED', 'SENT', 'IN_PROGRESS'].includes(c.status)).length,
  };

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">⚡ Commands Log</h1>
          <div className="page-subtitle">Audit log of all commands across all devices</div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? '⟳ Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', maxWidth: 640, marginBottom: 24 }}>
        <div className="stat-card blue">
          <div className="stat-label">Total</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-icon">📋</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Success</div>
          <div className="stat-value">{stats.success}</div>
          <div className="stat-icon">✅</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Failed</div>
          <div className="stat-value">{stats.failed}</div>
          <div className="stat-icon">❌</div>
        </div>
        <div className="stat-card orange">
          <div className="stat-label">In Progress</div>
          <div className="stat-value">{stats.pending}</div>
          <div className="stat-icon">⏳</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Filter:</span>
          {STATUS_FILTER_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '4px 12px',
                borderRadius: 100,
                border: '1px solid',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: statusFilter === s ? 'var(--accent-primary-glow)' : 'transparent',
                borderColor: statusFilter === s ? 'var(--border-active)' : 'var(--border)',
                color: statusFilter === s ? 'var(--accent-primary)' : 'var(--text-muted)',
              }}
            >
              {s === 'ALL' ? `All (${allCommands.length})` : (STATUS_LABELS[s] ?? s)}
            </button>
          ))}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Show last:</span>
            {[50, 100, 200, 500].map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: limit === n ? 'var(--bg-surface)' : 'transparent',
                  borderColor: limit === n ? 'rgba(255,255,255,0.15)' : 'var(--border)',
                  color: limit === n ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div className="loading-screen">
            <div className="spinner" /> Loading commands...
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-state-icon">⚠️</div>
            <div className="empty-state-text">Failed to load commands</div>
            <button className="btn btn-ghost btn-sm mt-3" onClick={() => refetch()}>Retry</button>
          </div>
        ) : commands.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-text">No commands found</div>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 'var(--radius-lg)' }}>
            <table>
              <thead>
                <tr>
                  <th>Command</th>
                  <th>Device</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Dispatched</th>
                  <th>Completed</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((cmd: any) => (
                  <tr
                    key={cmd.commandId}
                    style={{ cursor: cmd.device?.deviceUid ? 'pointer' : 'default' }}
                    onClick={() => cmd.device?.deviceUid && navigate(`/devices/${cmd.device.deviceUid}`)}
                    title={cmd.device?.deviceUid ? `Go to device ${cmd.device.deviceUid}` : ''}
                  >
                    <td>
                      <span
                        className="mono"
                        style={{
                          fontSize: 12,
                          background: 'var(--bg-surface)',
                          padding: '2px 8px',
                          borderRadius: 4,
                          color: 'var(--accent-cyan)',
                        }}
                      >
                        {cmd.commandType}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {cmd.device?.model ?? '—'}
                      </div>
                      <div
                        className="mono"
                        style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}
                      >
                        {cmd.device?.deviceUid?.slice(0, 16) ?? ''}...
                      </div>
                    </td>
                    <td>
                      <span className={`cmd-status-badge ${cmd.status}`}>
                        {STATUS_LABELS[cmd.status] ?? cmd.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {cmd.completedAt ? timeDiff(cmd.createdAt, cmd.completedAt) : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{formatDate(cmd.createdAt)}</td>
                    <td style={{ fontSize: 12 }}>{formatDate(cmd.completedAt)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {cmd.admin?.username ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
