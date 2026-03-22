// src/App.tsx
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDashboardStore } from './store/dashboardStore';
import { wsService } from './services/wsService';
import { LoginPage } from './pages/LoginPage';
import { DevicesListPage } from './pages/DevicesListPage';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { Sidebar } from './components/Sidebar';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useDashboardStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, setDeviceOnline, setDeviceOffline, updateHeartbeat } = useDashboardStore();

  useEffect(() => {
    if (!token) return;

    wsService.connect(token);

    const unsubscribe = wsService.on((event) => {
      if (event.event === 'device_online') setDeviceOnline(event.deviceUid);
      if (event.event === 'device_offline') setDeviceOffline(event.deviceUid);
      if (event.event === 'heartbeat') updateHeartbeat(event.deviceUid, event.data);
      if (event.event === 'notifications') {
        queryClient.invalidateQueries({ queryKey: ['device-notifications', event.deviceUid] });
      }
    });

    return () => {
      unsubscribe();
      wsService.disconnect();
    };
  }, [token]);

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-content">{children}</div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Navigate to="/devices" replace />} />
                    <Route path="/devices" element={<DevicesListPage />} />
                    <Route path="/devices/:deviceUid" element={<DeviceDetailPage />} />
                  </Routes>
                </AppLayout>
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
