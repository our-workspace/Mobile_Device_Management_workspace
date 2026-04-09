import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { commandsApi } from '../services/api';

interface FileItem {
  name: string;
  absolutePath: string;
  isDirectory: boolean;
  sizeBytes: number;
  lastModified: string;
  lastModifiedMs: number;
}

interface FileManagerProps {
  deviceUid: string;
  latestCommandResult: any | null; // latest list_directory result
}

export function FileManager({ deviceUid, latestCommandResult }: FileManagerProps) {
  const queryClient = useQueryClient();
  const [currentPath, setCurrentPath] = useState<string>('/storage/emulated/0');
  const [pathInput, setPathInput] = useState<string>('/storage/emulated/0');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // تحديث الملفات عند وصول النتيجة من الـ WebSocket أو الـ Polling
  useEffect(() => {
    if (
      latestCommandResult &&
      latestCommandResult.commandType === 'list_directory' &&
      latestCommandResult.status === 'success' &&
      // مقارنة المسارات بعد إزالة / من النهاية إن وُجدت
      (latestCommandResult.result?.currentPath || '').replace(/\/$/, '') === currentPath.replace(/\/$/, '')
    ) {
      const fetchedFiles = latestCommandResult.result.files || [];
      setFiles(fetchedFiles);
      queryClient.setQueryData(['dir-cache', deviceUid, currentPath], fetchedFiles);
      setIsLoading(false);
      setLastError(null);
    } else if (
      latestCommandResult &&
      latestCommandResult.commandType === 'list_directory' &&
      latestCommandResult.status === 'failure'
    ) {
      setLastError(latestCommandResult.error?.message || 'Failed to list directory');
      setIsLoading(false);
    }
  }, [latestCommandResult, currentPath, deviceUid, queryClient]);

  const dispatchMutation = useMutation({
    mutationFn: ({ commandType, params }: { commandType: string; params?: Record<string, unknown> }) =>
      commandsApi.dispatch(deviceUid, commandType, params ?? {}),
    onSuccess: () => {
      // الأمر تم إرساله بنجاح
    },
    onError: (err: any) => {
      setLastError(`Error dispatching command: ${err.message}`);
      setIsLoading(false);
    },
  });

  const loadDirectory = (rawPath: string, forceRefresh = false) => {
    // إزالة الشرطة المائلة من النهاية لتجنب عدم المطابقة (مثال: /storage/emulated/0/ = /storage/emulated/0)
    const path = rawPath.endsWith('/') && rawPath.length > 1 ? rawPath.slice(0, -1) : rawPath;
    
    setCurrentPath(path);
    setPathInput(path);
    setLastError(null);

    if (!forceRefresh) {
      const cached = queryClient.getQueryData<FileItem[]>(['dir-cache', deviceUid, path]);
      if (cached) {
        setFiles(cached);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setFiles([]);
    dispatchMutation.mutate({
      commandType: 'list_directory',
      params: { path },
    });
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      loadDirectory(pathInput.trim());
    }
  };

  // تحميل المجلد الافتراضي عند الفتح
  useEffect(() => {
    loadDirectory('/storage/emulated/0/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNavigateUp = () => {
    const parentPath = currentPath.split('/').filter(Boolean).slice(0, -1).join('/');
    loadDirectory('/' + parentPath);
  };

  const handlePullFile = (filePath: string) => {
    if (window.confirm(`Are you sure you want to pull this file?\n${filePath}`)) {
      dispatchMutation.mutate({
        commandType: 'pull_file',
        params: { filePath },
      });
      alert('Pull command dispatched. The file will be available in the backend soon.');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleNavigateUp}
          disabled={currentPath === '/' || currentPath === '/storage/emulated/0/' || isLoading}
        >
          ⬆️ Up
        </button>
        <form onSubmit={handlePathSubmit} style={{ flex: 1, display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="Enter path (e.g., /storage/emulated/0/Download)"
            style={{
              flex: 1,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              background: 'var(--bg-surface)',
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={isLoading || !pathInput.trim()}
            style={{ padding: '6px 12px' }}
          >
            Go
          </button>
        </form>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => loadDirectory(currentPath, true)}
          disabled={isLoading}
        >
          🔄 Refresh
        </button>
      </div>

      {lastError && (
        <div style={{ color: 'var(--semantic-red)', fontSize: 13, marginBottom: 16 }}>
          {lastError}
        </div>
      )}

      {isLoading && files.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ marginBottom: 16 }} />
          Loading directory... (Waiting for Agent)
        </div>
      ) : (
        <div className="table-container" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table style={{ minWidth: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1 }}>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Name</th>
                <th style={{ width: 100, textAlign: 'right' }}>Size</th>
                <th style={{ width: 160, textAlign: 'right' }}>Last Modified</th>
                <th style={{ width: 80 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 && !isLoading && !lastError ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Empty Directory</td></tr>
              ) : (
                files.map((file) => (
                  <tr key={file.absolutePath} style={{ opacity: isLoading ? 0.5 : 1 }}>
                    <td style={{ textAlign: 'center', fontSize: 18 }}>
                      {file.isDirectory ? '📁' : '📄'}
                    </td>
                    <td
                      style={{ cursor: file.isDirectory ? 'pointer' : 'default', fontWeight: file.isDirectory ? 600 : 400 }}
                      onClick={() => {
                        if (file.isDirectory) loadDirectory(file.absolutePath);
                      }}
                    >
                      {file.name}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      {file.isDirectory ? '—' : formatFileSize(file.sizeBytes)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(file.lastModifiedMs).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!file.isDirectory && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '2px 8px', fontSize: 11 }}
                          onClick={() => handlePullFile(file.absolutePath)}
                        >
                          Pull
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
