// src/pages/NotificationsPage.tsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { devicesApi } from '../services/api';
import type { Notification } from '../types';

export function NotificationsPage() {
  const { deviceUid } = useParams<{ deviceUid: string }>();
  const navigate = useNavigate();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch all notifications grouped by app (for chat view)
  const { data: notifsData, isLoading } = useQuery({
    queryKey: ['device-notifications-grouped', deviceUid],
    queryFn: () => devicesApi.getAllNotificationsGrouped(deviceUid!).then((r) => r.data),
    enabled: !!deviceUid,
    refetchInterval: 30_000, // Refresh every 30 seconds
  });

  // Apps list from API response
  const appList = notifsData?.apps ?? [];

  // Filter apps by search
  const filteredApps = appList.filter((app) =>
    app.appName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.packageName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get notifications for selected app
  const selectedApp = appList.find((a) => a.packageName === selectedPackage);
  const appNotifications = selectedApp?.notifications ?? [];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [appNotifications]);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>Loading notifications...</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      height: isMobile ? 'calc(100vh - 80px)' : 'calc(100vh - 120px)',
      gap: isMobile ? 0 : 16,
      flexDirection: isMobile ? 'column' : 'row'
    }}>
      {/* Sidebar - App List */}
      {(!isMobile || !selectedPackage) && (
        <div
          style={{
            width: isMobile ? '100%' : 300,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: isMobile ? 0 : 12,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0
          }}
        >
          {/* Header */}
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => navigate(`/devices/${deviceUid}`)}
                style={{ padding: '4px 8px' }}
              >
                ← Back
              </button>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🔔 Notifications</h2>
            </div>
            <input
              type="text"
              placeholder="Search apps..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          {/* App List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {filteredApps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                {searchTerm ? 'No apps found' : 'No notifications yet'}
              </div>
            ) : (
              filteredApps.map((app) => (
                <button
                  key={app.packageName}
                  onClick={() => setSelectedPackage(app.packageName)}
                  style={{
                    width: '100%',
                    padding: 12,
                    background: selectedPackage === app.packageName ? 'var(--accent-primary-glow)' : 'transparent',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    marginBottom: 4,
                  }}
                >
                  {/* App Icon */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: selectedPackage === app.packageName
                        ? 'var(--accent-primary)'
                        : 'var(--bg-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                  >
                    📱
                  </div>

                  {/* App Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {app.appName}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: 2,
                      }}
                    >
                      {app.packageName}
                    </div>
                  </div>

                  {/* Count Badge */}
                  <span
                    style={{
                      background: selectedPackage === app.packageName
                        ? 'var(--accent-primary)'
                        : 'var(--bg-surface)',
                      color: selectedPackage === app.packageName ? 'white' : 'var(--text-secondary)',
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 700,
                      minWidth: 28,
                      textAlign: 'center',
                    }}
                  >
                    {app.count}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Stats Footer */}
          <div
            style={{
              padding: 12,
              borderTop: '1px solid var(--border)',
              fontSize: 12,
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            {appList.length} apps • {notifsData?.total || 0} notifications
          </div>
        </div>
      )}

      {/* Chat View */}
      {(!isMobile || selectedPackage) && (
        <div
          style={{
            flex: 1,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: isMobile ? 0 : 12,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {!selectedPackage ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: 14,
              }}
            >
              Select an app to view notifications
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: isMobile ? '10px 16px' : 16,
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: 'var(--bg-secondary)',
                }}
              >
                {isMobile ? (
                  <button
                    onClick={() => setSelectedPackage(null)}
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '6px 10px', minWidth: 'auto' }}
                  >
                    ←
                  </button>
                ) : (
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                    }}
                  >
                    📱
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {appList.find((a: any) => a.packageName === selectedPackage)?.appName}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {appNotifications.length} notifications
                  </div>
                </div>
                {!isMobile && (
                  <button
                    onClick={() => setSelectedPackage(null)}
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '6px 12px' }}
                  >
                    ✕ Close
                  </button>
                )}
              </div>

              {/* Chat Messages */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {appNotifications.map((notification: Notification, index: number) => {
                  const isFirstOfDay =
                    index === 0 ||
                    new Date(notification.postedAt).toDateString() !==
                      new Date(appNotifications[index - 1].postedAt).toDateString();

                  return (
                    <div key={notification.id}>
                      {/* Date Divider */}
                      {isFirstOfDay && (
                        <div
                          style={{
                            textAlign: 'center',
                            margin: '16px 0',
                            position: 'relative',
                          }}
                        >
                          <span
                            style={{
                              background: 'var(--bg-surface)',
                              padding: '4px 12px',
                              borderRadius: 12,
                              fontSize: 11,
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                            }}
                          >
                            {new Date(notification.postedAt).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      )}

                      {/* Message Bubble */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          maxWidth: '85%',
                        }}
                      >
                        {/* Time */}
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            marginBottom: 4,
                            marginLeft: 8,
                          }}
                        >
                          {new Date(notification.postedAt).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>

                        {/* Bubble */}
                        <div
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '16px 16px 16px 4px',
                            padding: '12px 16px',
                            maxWidth: '100%',
                          }}
                        >
                          {/* Title */}
                          {notification.title && (
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: 'var(--accent-primary)',
                                marginBottom: 6,
                                lineHeight: 1.4,
                              }}
                            >
                              {notification.title}
                            </div>
                          )}

                          {/* Text */}
                          <div
                            style={{
                              fontSize: 14,
                              color: 'var(--text-primary)',
                              lineHeight: 1.5,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {notification.text || (
                              <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                                (No message content)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
