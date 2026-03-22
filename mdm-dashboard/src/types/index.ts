// src/types/index.ts

export interface Device {
  id: string;
  deviceUid: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  agentVersion: string;
  serialNumber: string | null;
  enrolledAt: string;
  lastSeenAt: string | null;
  isOnline: boolean;
}

export interface DeviceDetail extends Device {
  commands: Command[];
  backupFiles: BackupFile[];
}

export interface Command {
  commandId: string;
  commandType: string;
  status: CommandStatus;
  priority: string;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
  admin: { username: string } | null;
}

export type CommandStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'SENT'
  | 'IN_PROGRESS'
  | 'SUCCESS'
  | 'FAILURE'
  | 'TIMEOUT';

export interface BackupFile {
  id: string;
  fileType: string;
  fileName: string;
  fileSizeBytes: number;
  recordCount: number | null;
  storageProvider: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  packageName: string;
  appName: string;
  title: string | null;
  text: string | null;
  category: string | null;
  postedAt: string;
}

export interface HeartbeatData {
  battery: {
    level: number;
    isCharging: boolean;
    chargingType: string | null;
  };
  network: {
    type: 'WIFI' | 'MOBILE' | 'NONE';
    isConnected: boolean;
  };
  storage: {
    freeBytes: number;
    totalBytes: number;
    usedPercent: number;
  };
}

export interface Admin {
  id: string;
  username: string;
  email: string;
  role: string;
}

// WebSocket Dashboard Events
export type DashboardEvent =
  | { event: 'connected'; stats: { agentsOnline: number } }
  | { event: 'device_online'; deviceUid: string; timestamp: string }
  | { event: 'device_offline'; deviceUid: string; timestamp: string }
  | { event: 'heartbeat'; deviceUid: string; data: HeartbeatData; timestamp: string }
  | { event: 'command_result'; commandId: string; status: string; result?: unknown; timestamp: string }
  | { event: 'notifications'; deviceUid: string; notifications: Notification[]; timestamp: string };
