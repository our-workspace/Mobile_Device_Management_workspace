// src/store/dashboardStore.ts
import { create } from 'zustand';
import type { Admin, HeartbeatData } from '../types';

interface DeviceOnlineState {
  [deviceUid: string]: {
    isOnline: boolean;
    lastHeartbeat?: HeartbeatData;
    lastSeen?: string;
  };
}

interface DashboardStore {
  // Auth
  admin: Admin | null;
  token: string | null;
  setAuth: (admin: Admin, token: string) => void;
  clearAuth: () => void;

  // Live Device States (from WebSocket)
  deviceStates: DeviceOnlineState;
  setDeviceOnline: (deviceUid: string) => void;
  setDeviceOffline: (deviceUid: string) => void;
  updateHeartbeat: (deviceUid: string, data: HeartbeatData) => void;

  // Selected Device
  selectedDeviceUid: string | null;
  setSelectedDevice: (deviceUid: string | null) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  // Auth
  admin: (() => {
    try {
      const saved = localStorage.getItem('mdm_admin');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  })(),
  token: localStorage.getItem('mdm_token'),

  setAuth: (admin, token) => {
    localStorage.setItem('mdm_token', token);
    localStorage.setItem('mdm_admin', JSON.stringify(admin));
    set({ admin, token });
  },

  clearAuth: () => {
    localStorage.removeItem('mdm_token');
    localStorage.removeItem('mdm_admin');
    set({ admin: null, token: null });
  },

  // Device States
  deviceStates: {},

  setDeviceOnline: (deviceUid) =>
    set((state) => ({
      deviceStates: {
        ...state.deviceStates,
        [deviceUid]: {
          ...state.deviceStates[deviceUid],
          isOnline: true,
          lastSeen: new Date().toISOString(),
        },
      },
    })),

  setDeviceOffline: (deviceUid) =>
    set((state) => ({
      deviceStates: {
        ...state.deviceStates,
        [deviceUid]: {
          ...state.deviceStates[deviceUid],
          isOnline: false,
          lastSeen: new Date().toISOString(),
        },
      },
    })),

  updateHeartbeat: (deviceUid, data) =>
    set((state) => ({
      deviceStates: {
        ...state.deviceStates,
        [deviceUid]: {
          ...state.deviceStates[deviceUid],
          isOnline: true,
          lastHeartbeat: data,
          lastSeen: new Date().toISOString(),
        },
      },
    })),

  // Selection
  selectedDeviceUid: null,
  setSelectedDevice: (deviceUid) => set({ selectedDeviceUid: deviceUid }),
}));
