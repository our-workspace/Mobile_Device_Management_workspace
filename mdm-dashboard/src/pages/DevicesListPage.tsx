// src/pages/DevicesListPage.tsx
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { devicesApi } from '../services/api';
import { useDashboardStore } from '../store/dashboardStore';
import type { Device } from '../types';

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export function DevicesListPage() {
  const navigate = useNavigate();
  const deviceStates = useDashboardStore((s) => s.deviceStates);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list().then((r) => r.data),
    refetchInterval: 30_000,
  });

  const devices: Device[] = data?.devices ?? [];

  // دمج حالة الاتصال الحية من الـ WebSocket مع بيانات الـ API
  const enrichedDevices = devices.map((d) => {
    const liveState = deviceStates[d.deviceUid];
    return {
      ...d,
      isOnline: liveState ? liveState.isOnline : d.isOnline,
      lastSeen: liveState?.lastSeen ?? d.lastSeenAt,
      liveHeartbeat: liveState?.lastHeartbeat,
    };
  });

  const onlineCount = enrichedDevices.filter((d) => d.isOnline).length;
  const offlineCount = enrichedDevices.length - onlineCount;

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        Loading devices...
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⚠️</div>
        <div className="empty-state-text">Failed to load devices</div>
        <button className="btn btn-ghost btn-sm mt-3" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Devices</h1>
          <div className="page-subtitle">{devices.length} enrolled devices</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>
          ↻ Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', maxWidth: 480 }}>
        <div className="stat-card blue">
          <div className="stat-label">Total</div>
          <div className="stat-value">{devices.length}</div>
          <div className="stat-icon">📱</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Online</div>
          <div className="stat-value">{onlineCount}</div>
          <div className="stat-icon">🟢</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Offline</div>
          <div className="stat-value">{offlineCount}</div>
          <div className="stat-icon">🔴</div>
        </div>
      </div>

      {/* Devices Grid */}
      {enrichedDevices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">No devices enrolled yet</div>
        </div>
      ) : (
        <div className="devices-grid">
          {enrichedDevices.map((device) => (
            <DeviceCard
              key={device.deviceUid}
              device={device as any}
              heartbeat={(device as any).liveHeartbeat}
              onClick={() => navigate(`/devices/${device.deviceUid}`)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DeviceCard({
  device,
  heartbeat,
  onClick,
}: {
  device: Device & { lastSeen?: string };
  heartbeat?: any;
  onClick: () => void;
}) {
  return (
    <div
      className={`device-card ${device.isOnline ? 'online' : 'offline'}`}
      onClick={onClick}
      id={`device-${device.deviceUid}`}
    >
      <div className="device-card-header">
        <div>
          <div className="device-model">{device.model}</div>
          <div className="device-uid">{device.deviceUid}</div>
        </div>
        <StatusBadge isOnline={device.isOnline} />
      </div>

      {/* Live Heartbeat data */}
      {heartbeat && device.isOnline && (
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <MiniStat
            icon="🔋"
            value={`${heartbeat.battery.level}%`}
            color={heartbeat.battery.level > 30 ? 'var(--accent-success)' : 'var(--accent-danger)'}
          />
          <MiniStat
            icon={heartbeat.network.type === 'WIFI' ? '📶' : '📡'}
            value={heartbeat.network.type}
            color="var(--accent-primary)"
          />
          <MiniStat
            icon="💾"
            value={`${heartbeat.storage.usedPercent}%`}
            color={heartbeat.storage.usedPercent > 90 ? 'var(--accent-danger)' : 'var(--text-secondary)'}
          />
        </div>
      )}

      <div className="device-meta">
        <div className="device-meta-row">
          <span className="device-meta-label">Android</span>
          <span className="device-meta-value">{device.androidVersion}</span>
        </div>
        <div className="device-meta-row">
          <span className="device-meta-label">Manufacturer</span>
          <span className="device-meta-value">{device.manufacturer}</span>
        </div>
        <div className="device-meta-row">
          <span className="device-meta-label">Last seen</span>
          <span className="device-meta-value">
            {formatDate((device as any).lastSeen ?? device.lastSeenAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ isOnline }: { isOnline: boolean }) {
  return (
    <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
      <span className="dot" />
      {isOnline ? 'Online' : 'Offline'}
    </span>
  );
}

function MiniStat({ icon, value, color }: { icon: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color }}>{value}</span>
    </div>
  );
}
