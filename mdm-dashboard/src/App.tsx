// src/App.tsx
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDashboardStore } from './store/dashboardStore';
import { wsService } from './services/wsService';
import { LoginPage } from './pages/LoginPage';
import { DevicesListPage } from './pages/DevicesListPage';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { CommandsPage } from './pages/CommandsPage';
import { SmsBackupListPage, SmsViewerPage } from './pages/SmsViewerPage';
import { NotificationsPage } from './pages/NotificationsPage';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Close sidebar on route change for mobile
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

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
      {/* Mobile Top Header */}
      <div className="mobile-header">
         <div style={{display: 'flex', alignItems: 'center'}}>
           <div className="sidebar-logo-icon" style={{width: 28, height: 28, fontSize: 14}}>🛡️</div>
           <span style={{fontWeight: 700, marginLeft: 8}}>MDM Console</span>
         </div>
         <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
           {isMobileMenuOpen ? '✕' : '☰'}
         </button>
      </div>

      {isMobileMenuOpen && <div className="sidebar-backdrop" onClick={() => setIsMobileMenuOpen(false)}></div>}
      
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      
      <div className="main-content">
        <div className="page-content">{children}</div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/dashboard">
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
                    <Route path="/devices/:deviceUid/notifications" element={<NotificationsPage />} />
                    <Route path="/devices/:deviceUid/sms" element={<SmsBackupListPage />} />
                    <Route path="/devices/:deviceUid/sms/:backupFileId" element={<SmsViewerPage />} />
                    <Route path="/commands" element={<CommandsPage />} />
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
