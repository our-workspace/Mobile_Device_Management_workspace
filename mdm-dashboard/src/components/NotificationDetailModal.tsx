// src/components/NotificationDetailModal.tsx
import { useEffect } from 'react';
import type { Notification } from '../types';

interface NotificationDetailModalProps {
  notification: Notification | null;
  onClose: () => void;
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function getAppIcon(packageName: string): string {
  // أيقونات تقريبية بناءً على اسم الحزمة
  if (packageName.includes('whatsapp'))   return '💬';
  if (packageName.includes('telegram'))   return '✈️';
  if (packageName.includes('messenger'))  return '💙';
  if (packageName.includes('instagram'))  return '📸';
  if (packageName.includes('twitter') || packageName.includes('x.com')) return '🐦';
  if (packageName.includes('gmail') || packageName.includes('mail')) return '📧';
  if (packageName.includes('chrome') || packageName.includes('browser')) return '🌐';
  if (packageName.includes('phone') || packageName.includes('dialer'))   return '📞';
  if (packageName.includes('sms') || packageName.includes('message'))    return '💬';
  if (packageName.includes('bank') || packageName.includes('pay'))       return '🏦';
  if (packageName.includes('youtube'))    return '▶️';
  if (packageName.includes('maps'))       return '🗺️';
  if (packageName.includes('camera'))     return '📷';
  if (packageName.includes('settings'))   return '⚙️';
  if (packageName.includes('alarm') || packageName.includes('clock')) return '⏰';
  if (packageName.includes('spotify') || packageName.includes('music')) return '🎵';
  return '📱';
}

function getCategoryBadge(category: string | null): { label: string; color: string; bg: string } {
  if (!category) return { label: 'General', color: 'var(--text-muted)', bg: 'var(--bg-surface)' };
  const cat = category.toLowerCase();
  if (cat.includes('msg') || cat.includes('message')) return { label: 'Message', color: 'var(--accent-primary)', bg: 'var(--accent-primary-glow)' };
  if (cat.includes('call'))   return { label: 'Call', color: 'var(--accent-success)', bg: 'var(--accent-success-glow)' };
  if (cat.includes('alarm'))  return { label: 'Alarm', color: 'var(--accent-warning)', bg: 'var(--accent-warning-glow)' };
  if (cat.includes('email'))  return { label: 'Email', color: 'var(--accent-cyan)', bg: 'rgba(6,182,212,0.15)' };
  if (cat.includes('promo') || cat.includes('ad')) return { label: 'Promo', color: 'var(--accent-purple)', bg: 'rgba(139,92,246,0.15)' };
  if (cat.includes('err') || cat.includes('warn')) return { label: 'Alert', color: 'var(--accent-danger)', bg: 'var(--accent-danger-glow)' };
  return { label: category, color: 'var(--text-secondary)', bg: 'var(--bg-surface)' };
}

export function NotificationDetailModal({ notification, onClose }: NotificationDetailModalProps) {
  // إغلاق عند الضغط على Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // منع scroll الخلفية
  useEffect(() => {
    if (notification) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [notification]);

  if (!notification) return null;

  const icon = getAppIcon(notification.packageName);
  const category = getCategoryBadge(notification.category);

  return (
    <div
      className="notif-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-modal-title"
    >
      <div className="notif-modal">
        {/* Header */}
        <div className="notif-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="notif-modal-app-icon">{icon}</div>
            <div>
              <div className="notif-modal-app-name" id="notif-modal-title">
                {notification.appName}
              </div>
              <div className="notif-modal-package">{notification.packageName}</div>
            </div>
          </div>
          <button
            className="notif-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Category Badge */}
        {notification.category && (
          <div style={{ marginBottom: 20 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '3px 12px',
                borderRadius: 100,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                background: category.bg,
                color: category.color,
                border: `1px solid ${category.color}33`,
              }}
            >
              {category.label}
            </span>
          </div>
        )}

        {/* Title */}
        <div className="notif-modal-section">
          <div className="notif-modal-label">📌 Title</div>
          <div className="notif-modal-value">
            {notification.title || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No title</span>}
          </div>
        </div>

        {/* Body */}
        <div className="notif-modal-section">
          <div className="notif-modal-label">💬 Message</div>
          <div className="notif-modal-value notif-modal-body">
            {notification.text || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No message content</span>}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 20px' }} />

        {/* Metadata Grid */}
        <div className="notif-modal-meta-grid">
          <div className="notif-modal-meta-item">
            <div className="notif-modal-label">🕐 Posted At (Device)</div>
            <div className="notif-modal-meta-value mono">{formatDateTime(notification.postedAt)}</div>
          </div>
          <div className="notif-modal-meta-item" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <div className="notif-modal-label">📦 Package Name</div>
            <div className="notif-modal-meta-value mono" style={{ wordBreak: 'break-all' }}>
              {notification.packageName}
            </div>
          </div>
          <div className="notif-modal-meta-item">
            <div className="notif-modal-label">🔖 Category</div>
            <div className="notif-modal-meta-value">
              {notification.category || <span style={{ color: 'var(--text-muted)' }}>—</span>}
            </div>
          </div>
          <div className="notif-modal-meta-item">
            <div className="notif-modal-label">🆔 Record ID</div>
            <div className="notif-modal-meta-value mono" style={{ fontSize: 10 }}>{notification.id}</div>
          </div>
        </div>

        {/* Close Button */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
