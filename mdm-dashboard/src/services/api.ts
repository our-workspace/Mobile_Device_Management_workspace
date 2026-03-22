// src/services/api.ts
import axios from 'axios';

const BASE_URL = '/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor – إضافة JWT تلقائياً
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mdm_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor – معالجة 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('mdm_token');
      localStorage.removeItem('mdm_admin');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ---- Auth ----
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; admin: { id: string; username: string; role: string } }>('/auth/login', { username, password }),

  me: () =>
    api.get<{ admin: { id: string; username: string; role: string } }>('/auth/me'),
};

// ---- Devices ----
export const devicesApi = {
  list: () =>
    api.get<{ devices: any[]; total: number }>('/devices'),

  getById: (deviceUid: string) =>
    api.get<{ device: any }>(`/devices/${deviceUid}`),

  stats: () =>
    api.get<{ total: number; online: number; offline: number }>('/devices/stats'),

  getNotifications: (deviceUid: string, limit = 50) =>
    api.get<{ notifications: any[] }>(`/devices/${deviceUid}/notifications?limit=${limit}`),
};

// ---- Commands ----
export const commandsApi = {
  dispatch: (
    deviceUid: string,
    commandType: string,
    params: Record<string, unknown> = {},
    priority: 'low' | 'normal' | 'high' = 'normal'
  ) =>
    api.post<{ commandId: string; status: string; dispatched: boolean; message: string }>(
      `/devices/${deviceUid}/commands`,
      { commandType, params, priority }
    ),

  getHistory: (deviceUid: string, limit = 20) =>
    api.get<{ commands: any[] }>(`/devices/${deviceUid}/commands?limit=${limit}`),

  getAuditLog: (limit = 50) =>
    api.get<{ commands: any[] }>(`/audit?limit=${limit}`),
};

export default api;
