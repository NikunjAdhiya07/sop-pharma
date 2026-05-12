'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

import { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  FileCode2,
  Search,
  RefreshCw,
  Download,
  Eye,
  Loader2,
  CloudOff,
  FolderOpen,
  Filter,
} from 'lucide-react';

interface BunnyFile {
  name: string;
  path: string;
  size: number;
  lastModified: string;
  cdnUrl: string;
  type: 'docx' | 'pdf';
}

type FilterType = 'all' | 'docx' | 'pdf';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function getFolderFromPath(path: string) {
  const parts = path.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
}

export default function BunnyBrowserPage() {
  useAuthGuard();
  const [files, setFiles] = useState<BunnyFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchFiles = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/bunny/browse');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setFiles(data.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files from Bunny CDN');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const filtered = useMemo(() => {
    let list = files.filter((f) => {
      if (filterType !== 'all' && f.type !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        return f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
      else if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'size') cmp = a.size - b.size;
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [files, search, filterType, sortBy, sortDir]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const handlePreview = (file: BunnyFile) => {
    const params = new URLSearchParams({ path: file.cdnUrl });
    if (file.type === 'docx') {
      window.open(`/dashboard/view-word?${params}`, '_blank');
    } else {
      window.open(`/dashboard/view-doc?${params}`, '_blank');
    }
  };

  const docxCount = files.filter((f) => f.type === 'docx').length;
  const pdfCount = files.filter((f) => f.type === 'pdf').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Bunny CDN Browser
            </h1>
            <p className="text-slate-400">
              Browse all DOCX and PDF files stored in your Bunny CDN storage zone
            </p>
          </div>
          <button
            onClick={fetchFiles}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-all shadow-lg"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Files', value: files.length, color: 'from-purple-600 to-indigo-600' },
            { label: 'DOCX Files', value: docxCount, color: 'from-blue-600 to-cyan-600' },
            { label: 'PDF Files', value: pdfCount, color: 'from-rose-600 to-pink-600' },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`bg-gradient-to-br ${stat.color} rounded-xl p-4 text-white shadow-lg`}
            >
              <p className="text-sm font-medium opacity-80">{stat.label}</p>
              <p className="text-3xl font-bold mt-1">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 mb-6 border border-white/10 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or path..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            {(['all', 'docx', 'pdf'] as FilterType[]).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  filterType === t
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-400">
            Sort:
            {(['date', 'name', 'size'] as const).map((col) => (
              <button
                key={col}
                onClick={() => toggleSort(col)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all capitalize ${
                  sortBy === col
                    ? 'bg-slate-600 text-white'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                {col} {sortBy === col ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {error && (
          <div className="flex items-center gap-3 bg-red-500/20 border border-red-500/40 rounded-xl p-4 mb-6 text-red-300">
            <CloudOff className="h-5 w-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
            <p>Loading files from Bunny CDN…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
            <FolderOpen className="h-14 w-14" />
            <p className="text-lg">{files.length === 0 ? 'No files found in Bunny storage' : 'No files match your search'}</p>
          </div>
        ) : (
          <div className="bg-white/5 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-3 bg-white/5 border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span>Type</span>
              <span>File / Path</span>
              <button onClick={() => toggleSort('size')} className="hover:text-white transition-colors text-right">
                Size {sortBy === 'size' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </button>
              <button onClick={() => toggleSort('date')} className="hover:text-white transition-colors text-right">
                Modified {sortBy === 'date' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </button>
              <span className="text-right">Actions</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-white/5">
              {filtered.map((file) => {
                const folder = getFolderFromPath(file.path);
                return (
                  <div
                    key={file.path}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-4 items-center hover:bg-white/5 transition-colors"
                  >
                    {/* Icon */}
                    <div>
                      {file.type === 'docx' ? (
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500/20 border border-blue-500/30">
                          <FileCode2 className="h-5 w-5 text-blue-400" />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-rose-500/20 border border-rose-500/30">
                          <FileText className="h-5 w-5 text-rose-400" />
                        </div>
                      )}
                    </div>

                    {/* Name + path */}
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{file.name}</p>
                      {folder && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{folder}</p>
                      )}
                    </div>

                    {/* Size */}
                    <p className="text-sm text-slate-400 text-right whitespace-nowrap">
                      {formatSize(file.size)}
                    </p>

                    {/* Date */}
                    <p className="text-sm text-slate-400 text-right whitespace-nowrap">
                      {formatDate(file.lastModified)}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => handlePreview(file)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-all"
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                        Preview
                      </button>
                      <a
                        href={file.cdnUrl}
                        download={file.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-300 text-sm font-semibold rounded-lg transition-all"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <p className="text-center text-sm text-slate-500 mt-4">
            Showing {filtered.length} of {files.length} files
          </p>
        )}
      </div>
    </div>
  );
}
