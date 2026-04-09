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

  getNotifications: (deviceUid: string, page = 1, limit = 50) =>
    api.get<{ notifications: any[]; total: number; page: number; limit: number; pages: number }>(`/devices/${deviceUid}/notifications?page=${page}&limit=${limit}`),

  // جلب جميع الإشعارات مجمعة حسب التطبيق (لعرض الدردشة)
  getAllNotificationsGrouped: (deviceUid: string) =>
    api.get<{ total: number; apps: any[] }>(`/devices/${deviceUid}/notifications/all`),

  // جلب آخر heartbeat مخزّن في DB (يعمل سواء كان الجهاز online أو offline)
  getLatestHeartbeat: (deviceUid: string) =>
    api.get<{ heartbeat: any | null }>(`/devices/${deviceUid}/heartbeat/latest`),

  // قائمة ملفات الـ SMS backup
  getSmsBackups: (deviceUid: string) =>
    api.get<{ files: any[] }>(`/devices/${deviceUid}/sms`),

  // قراءة رسائل SMS من ملف معين
  getSmsMessages: (
    deviceUid: string,
    backupFileId: string,
    params: { page?: number; limit?: number; search?: string; contact?: string; threadId?: string; type?: string }
  ) => {
    const qs = new URLSearchParams();
    if (params.page)     qs.set('page',     String(params.page));
    if (params.limit)    qs.set('limit',    String(params.limit));
    if (params.search)   qs.set('search',   params.search);
    if (params.contact)  qs.set('contact',  params.contact);
    if (params.threadId) qs.set('threadId', params.threadId);
    if (params.type)     qs.set('type',     params.type);
    return api.get<any>(`/devices/${deviceUid}/sms/${backupFileId}/messages?${qs.toString()}`);
  },
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
