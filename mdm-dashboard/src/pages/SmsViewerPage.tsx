// src/pages/SmsViewerPage.tsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { devicesApi } from '../services/api';

interface SmsMessage {
  id: string;
  address: string;
  body: string;
  date: string;
  dateMs: number;
  type: 'inbox' | 'sent';
  read: boolean;
  threadId: string;
}

interface Contact {
  address: string;
  count: number;
  lastDate: number;
  threadCount: number;
}

interface SmsResponse {
  meta: {
    backupFileId: string;
    fileName: string;
    exportedAt: string;
    deviceUid: string;
    totalInFile: number;
  };
  pagination: { total: number; page: number; limit: number; pages: number };
  contacts: Contact[];
  messages: SmsMessage[];
}

function timeLabel(dateMs: number): string {
  const d = new Date(dateMs);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000)
    return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: '2-digit' });
}

function fullTime(dateMs: number): string {
  return new Date(dateMs).toLocaleString();
}

// ── Avatar initials colour ─────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#3b82f6','#8b5cf6','#06b6d4','#10b981',
  '#f59e0b','#ef4444','#ec4899','#14b8a6',
];
function avatarColor(address: string) {
  let h = 0;
  for (let i = 0; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(address: string) {
  if (/^\d+$/.test(address)) return address.slice(-2);
  return address.slice(0, 2).toUpperCase();
}

// ── Backup selector ────────────────────────────────────────────────────────
export function SmsBackupListPage() {
  const { deviceUid } = useParams<{ deviceUid: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['sms-backups', deviceUid],
    queryFn: () => devicesApi.getSmsBackups(deviceUid!).then(r => r.data.files),
    enabled: !!deviceUid,
  });

  const files: any[] = data ?? [];

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/devices/${deviceUid}`)}>
              ← Back
            </button>
          </div>
          <h1 className="page-title">💬 SMS Backups</h1>
          <div className="page-subtitle mono">{deviceUid}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-screen"><div className="spinner"/>Loading...</div>
      ) : files.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">No SMS backups found for this device</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
          {files.map((f: any) => (
            <div
              key={f.id}
              className="card"
              style={{ cursor:'pointer', transition:'all .2s' }}
              onClick={() => navigate(`/devices/${deviceUid}/sms/${f.id}`)}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-active)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                <div style={{
                  width:44, height:44, borderRadius:12,
                  background:'linear-gradient(135deg,#3b82f6,#06b6d4)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:22,
                }}>💬</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:14 }}>{f.fileName}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                    {new Date(f.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ display:'flex', gap:16 }}>
                <div>
                  <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:.5 }}>Messages</div>
                  <div style={{ fontWeight:700, fontSize:20, color:'var(--accent-primary)' }}>
                    {f.recordCount?.toLocaleString() ?? '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:.5 }}>Size</div>
                  <div style={{ fontWeight:600, fontSize:14, color:'var(--text-secondary)' }}>
                    {f.fileSizeBytes ? (Number(f.fileSizeBytes) / 1024).toFixed(0) + ' KB' : '—'}
                  </div>
                </div>
              </div>
              <div style={{
                marginTop:14, padding:'8px 12px',
                background:'var(--accent-primary-glow)', borderRadius:8,
                fontSize:12, color:'var(--accent-primary)', fontWeight:600,
                textAlign:'center',
              }}>
                📂 Open Viewer →
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Main SMS Viewer ────────────────────────────────────────────────────────
export function SmsViewerPage() {
  const { deviceUid, backupFileId } = useParams<{ deviceUid: string; backupFileId: string }>();
  const navigate = useNavigate();

  const [search,          setSearch]          = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [typeFilter,      setTypeFilter]      = useState('all');
  const [page,            setPage]            = useState(1);
  const LIMIT = 150;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // reset page on filter change
  useEffect(() => { setPage(1); }, [selectedContact, typeFilter]);

  const { data, isLoading, isFetching } = useQuery<SmsResponse>({
    queryKey: ['sms-messages', deviceUid, backupFileId, page, debouncedSearch, selectedContact, typeFilter],
    queryFn: () => devicesApi.getSmsMessages(deviceUid!, backupFileId!, {
      page, limit: LIMIT,
      search:  debouncedSearch || undefined,
      contact: selectedContact || undefined,
      type:    typeFilter !== 'all' ? typeFilter : undefined,
    }).then(r => r.data),
    enabled: !!deviceUid && !!backupFileId,
    placeholderData: keepPreviousData,
  });

  // scroll to bottom of messages when new page loads
  useEffect(() => {
    if (!isLoading) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data, isLoading]);

  const meta:       any        = data?.meta        ?? {};
  const pagination: any        = data?.pagination  ?? {};
  const contacts:   Contact[]  = data?.contacts    ?? [];
  const messages:   SmsMessage[] = data?.messages  ?? [];

  // group consecutive messages by sender for chat display
  interface Group { address: string; type: string; msgs: SmsMessage[] }
  const groups: Group[] = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    if (last && last.address === m.address && last.type === m.type) {
      last.msgs.push(m);
    } else {
      groups.push({ address: m.address, type: m.type, msgs: [m] });
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 56px)', overflow:'hidden' }}>

      {/* ── Top Bar ──────────────────────────────────────────── */}
      <div style={{
        display:'flex', alignItems:'center', gap:12, padding:'10px 0 14px',
        borderBottom:'1px solid var(--border)', flexShrink:0, flexWrap:'wrap',
      }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/devices/${deviceUid}/sms`)}>
          ← Backups
        </button>
        <div>
          <div style={{ fontWeight:700, fontSize:16 }}>💬 SMS Viewer</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
            {meta.fileName} · {meta.totalInFile?.toLocaleString()} messages · exported {meta.exportedAt ? new Date(meta.exportedAt).toLocaleString() : ''}
          </div>
        </div>

        {/* search */}
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <input
            type="text"
            placeholder="🔍 Search messages or contacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background:'var(--bg-surface)', border:'1px solid var(--border)',
              borderRadius:8, padding:'6px 14px', color:'var(--text-primary)',
              fontSize:13, outline:'none', width:260,
              fontFamily:'var(--font-sans)',
            }}
          />
          {['all','inbox','sent'].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                padding:'5px 14px', borderRadius:100, border:'1px solid',
                fontSize:11, fontWeight:600, cursor:'pointer',
                background: typeFilter === t ? 'var(--accent-primary-glow)' : 'transparent',
                borderColor: typeFilter === t ? 'var(--border-active)' : 'var(--border)',
                color: typeFilter === t ? 'var(--accent-primary)' : 'var(--text-muted)',
              }}
            >
              {t === 'all' ? 'All' : t === 'inbox' ? '📥 Inbox' : '📤 Sent'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div style={{ display:'flex', flex:1, gap:0, overflow:'hidden' }}>

        {/* ── Contacts sidebar ──────────────────────────────── */}
        <div style={{
          width:260, flexShrink:0,
          borderRight:'1px solid var(--border)',
          overflowY:'auto', background:'var(--bg-secondary)',
        }}>
          <div style={{ padding:'10px 12px 6px', fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1 }}>
            Contacts ({contacts.length})
          </div>

          {/* All */}
          <div
            onClick={() => setSelectedContact(null)}
            style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'8px 12px', cursor:'pointer',
              background: !selectedContact ? 'var(--accent-primary-glow)' : 'transparent',
              borderLeft: !selectedContact ? '3px solid var(--accent-primary)' : '3px solid transparent',
              transition:'background .15s',
            }}
          >
            <div style={{
              width:36, height:36, borderRadius:10, display:'flex',
              alignItems:'center', justifyContent:'center', fontSize:18,
              background:'var(--bg-surface)',
            }}>👥</div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color: !selectedContact ? 'var(--accent-primary)' : 'var(--text-primary)' }}>All Conversations</div>
              <div style={{ fontSize:11, color:'var(--text-muted)' }}>{pagination.total?.toLocaleString()} msgs</div>
            </div>
          </div>

          {contacts.map(c => {
            const isActive = selectedContact === c.address;
            return (
              <div
                key={c.address}
                onClick={() => setSelectedContact(isActive ? null : c.address)}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'8px 12px', cursor:'pointer',
                  background: isActive ? 'var(--accent-primary-glow)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--accent-primary)' : '3px solid transparent',
                  transition:'background .15s',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{
                  width:36, height:36, borderRadius:10, flexShrink:0,
                  background: avatarColor(c.address),
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:700, color:'white',
                }}>
                  {initials(c.address)}
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{
                    fontSize:12, fontWeight:600,
                    color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  }}>{c.address}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>
                    {c.count} msgs · {timeLabel(c.lastDate)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Messages area ─────────────────────────────────── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* header */}
          {selectedContact && (
            <div style={{
              padding:'10px 20px', borderBottom:'1px solid var(--border)',
              display:'flex', alignItems:'center', gap:12, flexShrink:0,
              background:'var(--bg-card)',
            }}>
              <div style={{
                width:36, height:36, borderRadius:10,
                background: avatarColor(selectedContact),
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:13, fontWeight:700, color:'white',
              }}>{initials(selectedContact)}</div>
              <div>
                <div style={{ fontWeight:700, fontSize:14 }}>{selectedContact}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                  {pagination.total} messages
                </div>
              </div>
            </div>
          )}

          {/* pagination bar */}
          {pagination.pages > 1 && (
            <div style={{
              display:'flex', alignItems:'center', gap:8, justifyContent:'center',
              padding:'6px 0', borderBottom:'1px solid var(--border)',
              background:'var(--bg-secondary)', flexShrink:0, flexWrap:'wrap',
            }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(1)}>⏮</button>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>◀</button>
              <span style={{ fontSize:12, color:'var(--text-muted)', padding:'0 8px' }}>
                Page {page} / {pagination.pages} &nbsp;·&nbsp; {pagination.total?.toLocaleString()} messages
              </span>
              <button className="btn btn-ghost btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>▶</button>
              <button className="btn btn-ghost btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(pagination.pages)}>⏭</button>
            </div>
          )}

          {/* messages list */}
          <div style={{
            flex:1, overflowY:'auto', padding:'20px 24px',
            display:'flex', flexDirection:'column', gap:4,
            opacity: isFetching ? 0.7 : 1, transition:'opacity .2s',
          }}>
            {isLoading ? (
              <div className="loading-screen"><div className="spinner"/>Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div className="empty-state-text">No messages found</div>
              </div>
            ) : (
              groups.map((group, gi) => {
                const isSent = group.type === 'sent';
                const color  = avatarColor(group.address);
                return (
                  <div key={gi} style={{
                    display:'flex', flexDirection:'column',
                    alignItems: isSent ? 'flex-end' : 'flex-start',
                    marginBottom: 6,
                  }}>
                    {/* contact label (only for inbox) */}
                    {!isSent && (
                      <div style={{
                        display:'flex', alignItems:'center', gap:6, marginBottom:3,
                      }}>
                        <div style={{
                          width:22, height:22, borderRadius:6, background:color,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:9, fontWeight:700, color:'white',
                        }}>{initials(group.address)}</div>
                        <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600 }}>
                          {group.address}
                        </span>
                      </div>
                    )}

                    {/* bubble stack */}
                    <div style={{ display:'flex', flexDirection:'column', gap:2, alignItems: isSent ? 'flex-end' : 'flex-start', maxWidth:'70%' }}>
                      {group.msgs.map((m, mi) => (
                        <div key={m.id} title={fullTime(m.dateMs)}>
                          <div style={{
                            padding:'8px 14px',
                            background: isSent
                              ? 'linear-gradient(135deg, #2563eb, #3b82f6)'
                              : 'var(--bg-surface)',
                            color: isSent ? 'white' : 'var(--text-primary)',
                            borderRadius: isSent
                              ? (mi === 0 ? '18px 18px 4px 18px' : mi === group.msgs.length - 1 ? '4px 18px 18px 18px' : '4px 18px 4px 18px')
                              : (mi === 0 ? '18px 18px 18px 4px' : mi === group.msgs.length - 1 ? '18px 4px 18px 18px' : '18px 4px 4px 18px'),
                            fontSize: 13,
                            lineHeight: 1.5,
                            border: isSent ? 'none' : '1px solid var(--border)',
                            wordBreak: 'break-word',
                            direction: /[\u0600-\u06FF]/.test(m.body) ? 'rtl' : 'ltr',
                          }}>
                            {m.body}
                          </div>
                          {/* timestamp on last bubble */}
                          {mi === group.msgs.length - 1 && (
                            <div style={{
                              fontSize: 10, color:'var(--text-muted)',
                              marginTop: 2, textAlign: isSent ? 'right' : 'left',
                              display:'flex', alignItems:'center', gap:4,
                              justifyContent: isSent ? 'flex-end' : 'flex-start',
                            }}>
                              {timeLabel(m.dateMs)}
                              {m.type === 'sent' && (
                                <span style={{ opacity: .7 }}>{m.read ? '✓✓' : '✓'}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
