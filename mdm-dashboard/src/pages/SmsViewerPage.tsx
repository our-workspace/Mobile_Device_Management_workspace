// src/pages/SmsViewerPage.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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

function dateSeparatorLabel(dateMs: number): string {
  const d = new Date(dateMs);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate();
}

// highlight search term inside text
function HighlightText({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === term.toLowerCase()
          ? <mark key={i} style={{ background: '#f59e0b44', color: 'var(--text-primary)', borderRadius: 3, padding: '0 2px' }}>{p}</mark>
          : p
      )}
    </>
  );
}

// ── Avatar initials colour ─────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/devices/${deviceUid}`)}>
              ← Back
            </button>
          </div>
          <h1 className="page-title">💬 SMS Backups</h1>
          <div className="page-subtitle mono">{deviceUid}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-screen"><div className="spinner" />Loading...</div>
      ) : files.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">No SMS backups found for this device</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {files.map((f: any) => (
            <div
              key={f.id}
              className="card"
              style={{ cursor: 'pointer', transition: 'all .2s' }}
              onClick={() => navigate(`/devices/${deviceUid}/sms/${f.id}`)}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-active)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'linear-gradient(135deg,#3b82f6,#06b6d4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                }}>💬</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{f.fileName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(f.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Messages</div>
                  <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--accent-primary)' }}>
                    {f.recordCount?.toLocaleString() ?? '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Size</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)' }}>
                    {f.fileSizeBytes ? (Number(f.fileSizeBytes) / 1024).toFixed(0) + ' KB' : '—'}
                  </div>
                </div>
              </div>
              <div style={{
                marginTop: 14, padding: '8px 12px',
                background: 'var(--accent-primary-glow)', borderRadius: 8,
                fontSize: 12, color: 'var(--accent-primary)', fontWeight: 600,
                textAlign: 'center',
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

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const LIMIT = 50;

  // ── Jump-to-context state ──
  // When user clicks a search result, we switch to "context mode":
  // clear the search, optionally filter by contact, and highlight the target message.
  const [jumpTargetId,      setJumpTargetId]      = useState<string | null>(null);
  const [jumpTargetDateMs,  setJumpTargetDateMs]  = useState<number | null>(null);
  const [jumpHighlightId,   setJumpHighlightId]   = useState<string | null>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // DOM refs for individual messages so we can scroll to target
  const messageEls = useRef<Map<string, HTMLDivElement>>(new Map());

  const scrollContainerRef  = useRef<HTMLDivElement>(null);
  const topSentinelRef      = useRef<HTMLDivElement>(null);
  const prevScrollHeight    = useRef<number>(0);
  const isRestoringScroll   = useRef(false);
  const hasScrolledToBottom = useRef(false);
  // track whether we've already scrolled-to the jump target in this jump session
  const jumpScrolled        = useRef(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Show search results panel when there is active search text
  useEffect(() => {
    if (debouncedSearch) setShowSearchResults(true);
    else setShowSearchResults(false);
  }, [debouncedSearch]);

  // ── Infinite query for the MAIN conversation view ──
  // Uses selectedContact (set when jumping to context)
  // debouncedSearch is intentionally cleared on jump so we see full context
  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    isFetching,
  } = useInfiniteQuery<SmsResponse>({
    queryKey: ['sms-infinite', deviceUid, backupFileId, debouncedSearch, selectedContact, typeFilter],
    queryFn: ({ pageParam = 1 }) =>
      devicesApi.getSmsMessages(deviceUid!, backupFileId!, {
        page:    pageParam as number,
        limit:   LIMIT,
        search:  debouncedSearch || undefined,
        contact: selectedContact || undefined,
        type:    typeFilter !== 'all' ? typeFilter : undefined,
      }).then(r => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, pages } = lastPage.pagination;
      return page < pages ? page + 1 : undefined;
    },
    enabled: !!deviceUid && !!backupFileId,
  });

  // Flatten all messages (pages load oldest → newest order from API desc)
  const allMessages: SmsMessage[] = data?.pages.flatMap(p => p.messages) ?? [];
  const totalMessages = data?.pages[0]?.pagination.total ?? 0;
  const totalPages    = data?.pages[0]?.pagination.pages ?? 0;
  const loadedPages   = data?.pages.length ?? 0;
  const meta          = data?.pages[0]?.meta ?? {};
  const contacts:  Contact[] = data?.pages[0]?.contacts ?? [];

  // Scroll to bottom on first load (newest messages)
  useEffect(() => {
    if (!isLoading && allMessages.length > 0 && !hasScrolledToBottom.current && !jumpTargetId) {
      hasScrolledToBottom.current = true;
      setTimeout(() => {
        const el = scrollContainerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }, [isLoading, allMessages.length, jumpTargetId]);

  // Preserve scroll position when loading older messages (normal infinite scroll)
  useEffect(() => {
    if (isRestoringScroll.current) {
      const el = scrollContainerRef.current;
      if (el) {
        const newScrollHeight = el.scrollHeight;
        el.scrollTop = newScrollHeight - prevScrollHeight.current;
      }
      isRestoringScroll.current = false;
    }
  });

  // ── AUTO-SCROLL TO JUMP TARGET ──
  // After pages load, check if the target message is in the DOM. If so, scroll to it.
  // If not, keep fetching more pages until we find it.
  useEffect(() => {
    if (!jumpTargetId || jumpScrolled.current) return;

    const el = messageEls.current.get(jumpTargetId);
    if (el) {
      // Found in DOM — scroll to it
      jumpScrolled.current = true;
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash highlight animation
        el.animate(
          [
            { boxShadow: '0 0 0 3px #f59e0b, 0 0 24px 6px #f59e0b55', background: '#f59e0b22' },
            { boxShadow: '0 0 0 2px #f59e0b88, 0 0 12px 2px #f59e0b33', background: '#f59e0b11' },
            { boxShadow: 'none', background: 'transparent' },
          ],
          { duration: 2200, easing: 'ease-out', fill: 'forwards' }
        );
      }, 80);
    } else if (jumpTargetDateMs !== null && !isFetchingNextPage && hasNextPage) {
      // Message not yet in DOM — check if we've fetched past its date
      const oldestLoaded = allMessages[0]?.dateMs ?? Infinity;
      if (jumpTargetDateMs >= oldestLoaded || allMessages.length === 0) {
        // Need to load more pages to reach the date of the target
        const scrollEl = scrollContainerRef.current;
        if (scrollEl) prevScrollHeight.current = scrollEl.scrollHeight;
        isRestoringScroll.current = true;
        fetchNextPage();
      }
    }
  });

  // Reset on filter change
  useEffect(() => {
    hasScrolledToBottom.current = false;
  }, [selectedContact, typeFilter, debouncedSearch]);

  // Intersection observer for top sentinel → load older messages (normal infinite scroll)
  const handleTopSentinel = useCallback(() => {
    // Don't auto-load via sentinel when we're in jump-scroll mode
    if (jumpTargetId && !jumpScrolled.current) return;
    if (hasNextPage && !isFetchingNextPage) {
      const el = scrollContainerRef.current;
      if (el) prevScrollHeight.current = el.scrollHeight;
      isRestoringScroll.current = true;
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, jumpTargetId]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) handleTopSentinel(); },
      { root: scrollContainerRef.current, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleTopSentinel]);

  // ── Jump to context handler ──
  const handleJumpToContext = useCallback((msg: SmsMessage) => {
    // Clear search → reload conversation view without filter
    setSearch('');
    setDebouncedSearch('');
    setShowSearchResults(false);
    setSelectedContact(msg.address);   // narrow to this contact's conversation
    setTypeFilter('all');

    // Mark target for scrolling
    setJumpTargetId(msg.id);
    setJumpTargetDateMs(msg.dateMs);
    setJumpHighlightId(msg.id);
    jumpScrolled.current = false;
    hasScrolledToBottom.current = false;
    messageEls.current.clear();
  }, []);

  // Clear jump highlight after 4 seconds
  useEffect(() => {
    if (!jumpHighlightId) return;
    const t = setTimeout(() => setJumpHighlightId(null), 4000);
    return () => clearTimeout(t);
  }, [jumpHighlightId]);

  // group consecutive messages for chat-bubble display
  interface Group { address: string; type: string; msgs: SmsMessage[] }
  const groups: Array<Group | { dateSep: string; dateMs: number }> = [];
  for (let i = 0; i < allMessages.length; i++) {
    const m = allMessages[i];
    const prev = allMessages[i - 1];
    if (!prev || !isSameDay(prev.dateMs, m.dateMs)) {
      groups.push({ dateSep: dateSeparatorLabel(m.dateMs), dateMs: m.dateMs });
    }
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && 'address' in lastGroup && lastGroup.address === m.address && lastGroup.type === m.type) {
      lastGroup.msgs.push(m);
    } else {
      groups.push({ address: m.address, type: m.type, msgs: [m] });
    }
  }

  const progressPct = totalMessages > 0 ? Math.round((allMessages.length / totalMessages) * 100) : 0;

  // ── Search-results query (separate, always filtered by search term) ──
  const {
    data: searchData,
    isLoading: searchLoading,
    isFetchingNextPage: searchFetchingNext,
    fetchNextPage: searchFetchNext,
    hasNextPage: searchHasNext,
  } = useInfiniteQuery<SmsResponse>({
    queryKey: ['sms-search-results', deviceUid, backupFileId, debouncedSearch, typeFilter],
    queryFn: ({ pageParam = 1 }) =>
      devicesApi.getSmsMessages(deviceUid!, backupFileId!, {
        page:   pageParam as number,
        limit:  20,
        search: debouncedSearch,
        type:   typeFilter !== 'all' ? typeFilter : undefined,
      }).then(r => r.data),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const { page, pages } = last.pagination;
      return page < pages ? page + 1 : undefined;
    },
    enabled: !!deviceUid && !!backupFileId && !!debouncedSearch,
  });

  const searchResults: SmsMessage[] = searchData?.pages.flatMap(p => p.messages) ?? [];
  const searchTotal = searchData?.pages[0]?.pagination.total ?? 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 56px)',
      overflow: 'hidden',
    }}>

      {/* ── Top Bar ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: isMobile ? '8px 12px' : '10px 16px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        flexWrap: 'wrap',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: isMobile ? '100%' : 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/devices/${deviceUid}/sms`)}>
            ← Backups
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>💬 SMS Viewer</div>
            {!isMobile && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {(meta as any).fileName} · {((meta as any).totalInFile)?.toLocaleString()} messages
              </div>
            )}
          </div>
        </div>

        {/* search and filters */}
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          width: isMobile ? '100%' : 'auto',
          marginLeft: isMobile ? 0 : 'auto',
          overflowX: 'auto',
          paddingBottom: isMobile ? 4 : 0,
        }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="🔍 Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                background: showSearchResults ? 'var(--bg-card)' : 'var(--bg-surface)',
                border: `1px solid ${showSearchResults ? 'var(--border-active)' : 'var(--border)'}`,
                borderRadius: 8,
                padding: '6px 12px',
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
                width: isMobile ? '100%' : 220,
                minWidth: isMobile ? 0 : 220,
                fontFamily: 'var(--font-sans)',
                transition: 'border-color .2s, background .2s',
              }}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setShowSearchResults(false); }}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 14, padding: 0, lineHeight: 1,
                }}
              >✕</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['all', 'inbox', 'sent'].map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                style={{
                  padding: isMobile ? '4px 10px' : '5px 12px',
                  borderRadius: 100,
                  border: '1px solid',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  background: typeFilter === t ? 'var(--accent-primary-glow)' : 'transparent',
                  borderColor: typeFilter === t ? 'var(--border-active)' : 'var(--border)',
                  color: typeFilter === t ? 'var(--accent-primary)' : 'var(--text-muted)',
                }}
              >
                {t === 'inbox' ? '📥' : t === 'sent' ? '📤' : 'All'}
              </button>
            ))}
          </div>

          {/* Jump target indicator */}
          {jumpTargetId && (
            <button
              onClick={() => {
                setJumpTargetId(null);
                setJumpTargetDateMs(null);
                setJumpHighlightId(null);
                jumpScrolled.current = false;
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 8,
                background: '#f59e0b22', border: '1px solid #f59e0b88',
                color: '#f59e0b', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              📍 In context · ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, gap: 0, overflow: 'hidden' }}>

        {/* ── Contacts sidebar ──────────────────────────────── */}
        {(!isMobile || (!selectedContact && !showSearchResults)) && (
          <div style={{
            width: isMobile ? '100%' : 260,
            flexShrink: 0,
            borderRight: isMobile ? 'none' : '1px solid var(--border)',
            overflowY: 'auto',
            background: 'var(--bg-secondary)',
          }}>
            <div style={{ padding: '10px 12px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Contacts ({contacts.length})
            </div>

            {/* All */}
            <div
              onClick={() => { setSelectedContact(null); setJumpTargetId(null); setJumpHighlightId(null); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                cursor: 'pointer',
                background: !selectedContact ? 'var(--accent-primary-glow)' : 'transparent',
                borderLeft: !selectedContact ? '3px solid var(--accent-primary)' : '3px solid transparent',
                transition: 'background .15s',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 18,
                background: 'var(--bg-surface)',
              }}>👥</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: !selectedContact ? 'var(--accent-primary)' : 'var(--text-primary)' }}>All Conversations</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{totalMessages.toLocaleString()} msgs</div>
              </div>
            </div>

            {contacts.map(c => {
              const isActive = selectedContact === c.address;
              return (
                <div
                  key={c.address}
                  onClick={() => { setSelectedContact(isActive ? null : c.address); setJumpTargetId(null); setJumpHighlightId(null); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: isActive ? 'var(--accent-primary-glow)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--accent-primary)' : '3px solid transparent',
                    transition: 'background .15s',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: avatarColor(c.address),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: 'white',
                  }}>
                    {initials(c.address)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600,
                      color: isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{c.address}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {c.count} msgs · {timeLabel(c.lastDate)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Search Results Panel ─────────────────────────── */}
        {showSearchResults && (
          <div style={{
            width: isMobile ? '100%' : 340,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--bg-secondary)',
          }}>
            {/* Header */}
            <div style={{
              padding: '10px 14px 8px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  🔍 Search Results
                </div>
                {searchTotal > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {searchTotal.toLocaleString()} matches · click to jump to context
                  </div>
                )}
              </div>
              <button
                onClick={() => { setSearch(''); setShowSearchResults(false); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 16, padding: '2px 6px',
                  borderRadius: 6, lineHeight: 1,
                }}
              >✕</button>
            </div>

            {/* Results list */}
            <div
              style={{ flex: 1, overflowY: 'auto' }}
              onScroll={e => {
                const el = e.currentTarget;
                const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                if (atBottom && searchHasNext && !searchFetchingNext) searchFetchNext();
              }}
            >
              {searchLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--accent-primary)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                  Searching…
                </div>
              ) : searchResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                  No results for "<strong>{debouncedSearch}</strong>"
                </div>
              ) : (
                <>
                  {searchResults.map(msg => (
                    <div
                      key={msg.id}
                      onClick={() => handleJumpToContext(msg)}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'background .15s',
                        borderLeft: jumpTargetId === msg.id ? '3px solid #f59e0b' : '3px solid transparent',
                        background: jumpTargetId === msg.id ? '#f59e0b11' : 'transparent',
                      }}
                      onMouseEnter={e => {
                        if (jumpTargetId !== msg.id)
                          (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)';
                      }}
                      onMouseLeave={e => {
                        if (jumpTargetId !== msg.id)
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                      }}
                    >
                      {/* Contact row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                          background: avatarColor(msg.address),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: 'white',
                        }}>{initials(msg.address)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {msg.address}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fullTime(msg.dateMs)}</div>
                        </div>
                        <div style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
                          background: msg.type === 'sent' ? '#2563eb22' : '#10b98122',
                          color: msg.type === 'sent' ? '#3b82f6' : '#10b981',
                        }}>
                          {msg.type === 'sent' ? '↑ Sent' : '↓ Inbox'}
                        </div>
                      </div>

                      {/* Message snippet */}
                      <div style={{
                        fontSize: 12, color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        direction: /[\u0600-\u06FF]/.test(msg.body) ? 'rtl' : 'ltr',
                      }}>
                        <HighlightText text={msg.body} term={debouncedSearch} />
                      </div>

                      {/* Jump label */}
                      <div style={{ marginTop: 5, fontSize: 10, color: 'var(--accent-primary)', fontWeight: 600 }}>
                        📍 Tap to view in context →
                      </div>
                    </div>
                  ))}

                  {/* Load more results */}
                  {searchHasNext && (
                    <div style={{ textAlign: 'center', padding: '10px 0' }}>
                      {searchFetchingNext ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                          <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--accent-primary)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                          Loading more…
                        </div>
                      ) : (
                        <button
                          onClick={() => searchFetchNext()}
                          style={{
                            background: 'none', border: '1px solid var(--border)',
                            borderRadius: 8, padding: '6px 16px',
                            fontSize: 11, color: 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          Load more results
                        </button>
                      )}
                    </div>
                  )}

                  {!searchHasNext && searchResults.length > 0 && (
                    <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 10, color: 'var(--text-muted)' }}>
                      All {searchTotal.toLocaleString()} results shown
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Messages area ─────────────────────────────────── */}
        {(!isMobile || selectedContact || !showSearchResults) && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Contact header */}
            {selectedContact && (
              <div style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexShrink: 0,
                background: 'var(--bg-card)',
              }}>
                {isMobile && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelectedContact(null)}
                    style={{ padding: '4px 8px', minWidth: 'auto' }}
                  >←</button>
                )}
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: avatarColor(selectedContact),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: 'white',
                }}>{initials(selectedContact)}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{selectedContact}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {totalMessages.toLocaleString()} messages
                    {jumpTargetId && <span style={{ color: '#f59e0b', marginLeft: 6 }}>· jumping to result…</span>}
                  </div>
                </div>
              </div>
            )}

            {/* Progress bar / load status */}
            <div style={{
              flexShrink: 0,
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              padding: '6px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${progressPct}%`,
                    background: 'linear-gradient(90deg, var(--accent-primary), #06b6d4)',
                    borderRadius: 2,
                    transition: 'width .4s ease',
                  }} />
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {allMessages.length.toLocaleString()} / {totalMessages.toLocaleString()} msgs
                {jumpTargetId && !jumpScrolled.current
                  ? <span style={{ color: '#f59e0b', marginLeft: 6 }}>· locating message…</span>
                  : loadedPages < totalPages
                    ? <span style={{ color: 'var(--accent-primary)', marginLeft: 6 }}>· scroll up to load more</span>
                    : totalMessages > 0
                      ? <span style={{ color: '#10b981', marginLeft: 6 }}>· all loaded ✓</span>
                      : null
                }
              </div>
              {isFetching && !isLoading && (
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--accent-primary)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
              )}
            </div>

            {/* Messages list - scrollable */}
            <div
              ref={scrollContainerRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: isMobile ? '8px 12px' : '16px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {isLoading ? (
                <div className="loading-screen"><div className="spinner" />Loading messages...</div>
              ) : allMessages.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🔍</div>
                  <div className="empty-state-text">No messages found</div>
                </div>
              ) : (
                <>
                  {/* Top sentinel — triggers loading OLDER messages */}
                  <div ref={topSentinelRef} style={{ height: 1, flexShrink: 0 }} />

                  {/* Loading older indicator */}
                  {isFetchingNextPage && (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '10px 0', fontSize: 12, color: 'var(--text-muted)',
                    }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--accent-primary)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                      {jumpTargetId && !jumpScrolled.current ? 'Locating message…' : 'Loading older messages…'}
                    </div>
                  )}

                  {/* All loaded banner */}
                  {!hasNextPage && allMessages.length > 0 && (
                    <div style={{
                      textAlign: 'center', padding: '10px 0',
                      fontSize: 11, color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border)',
                      marginBottom: 8,
                    }}>
                      🗓 Beginning of conversation
                    </div>
                  )}

                  {/* Rendered groups with date separators */}
                  {groups.map((item, idx) => {
                    if ('dateSep' in item) {
                      return (
                        <div key={`sep-${item.dateMs}-${idx}`} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          margin: '10px 0 6px',
                        }}>
                          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                          <div style={{
                            fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                            background: 'var(--bg-secondary)', padding: '3px 10px',
                            borderRadius: 100, border: '1px solid var(--border)',
                            whiteSpace: 'nowrap',
                          }}>
                            {item.dateSep}
                          </div>
                          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        </div>
                      );
                    }

                    const group = item as { address: string; type: string; msgs: SmsMessage[] };
                    const isSent = group.type === 'sent';
                    const color = avatarColor(group.address);

                    return (
                      <div key={`grp-${idx}`} style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isSent ? 'flex-end' : 'flex-start',
                        marginBottom: 6,
                      }}>
                        {/* contact label (only for inbox) */}
                        {!isSent && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <div style={{
                              width: 22, height: 22, borderRadius: 6, background: color,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 9, fontWeight: 700, color: 'white',
                            }}>{initials(group.address)}</div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                              {group.address}
                            </span>
                          </div>
                        )}

                        {/* bubble stack */}
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          alignItems: isSent ? 'flex-end' : 'flex-start',
                          maxWidth: isMobile ? '85%' : '70%',
                        }}>
                          {group.msgs.map((m, mi) => {
                            const isHighlighted = m.id === jumpHighlightId;
                            return (
                              <div
                                key={m.id}
                                title={fullTime(m.dateMs)}
                                ref={el => {
                                  if (el) messageEls.current.set(m.id, el);
                                  else messageEls.current.delete(m.id);
                                }}
                                style={{
                                  borderRadius: 20,
                                  outline: isHighlighted ? '2px solid #f59e0b' : 'none',
                                  outlineOffset: 3,
                                  transition: 'outline .3s',
                                }}
                              >
                                <div style={{
                                  padding: '8px 14px',
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
                                    fontSize: 10, color: 'var(--text-muted)',
                                    marginTop: 2, textAlign: isSent ? 'right' : 'left',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    justifyContent: isSent ? 'flex-end' : 'flex-start',
                                  }}>
                                    {timeLabel(m.dateMs)}
                                    {m.type === 'sent' && (
                                      <span style={{ opacity: .7 }}>{m.read ? '✓✓' : '✓'}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
