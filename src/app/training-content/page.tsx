'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Video as VideoIcon, Upload, Search, Trash2, Pencil, Play, Loader2, Calendar, Film } from 'lucide-react';
import VideoUploadModal from './components/VideoUploadModal';
import VideoPreviewModal from './components/VideoPreviewModal';
import VideoEditModal from './components/VideoEditModal';

interface VideoRow {
  _id: string;
  title: string;
  department: string;
  designation?: string;
  sopNo?: string;
  version?: string;
  description?: string;
  bunnyCdnUrl: string;
  thumbnailUrl?: string;
  fileType: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

const FILE_TYPES = ['mp4', 'mov', 'webm'];

export default function TrainingContentPage() {
  const [items, setItems] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [sopNo, setSopNo] = useState('');
  const [version, setVersion] = useState('');
  const [fileType, setFileType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState<VideoRow | null>(null);
  const [editing, setEditing] = useState<VideoRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const departments = useMemo(() => {
    const set = new Set<string>();
    items.forEach((v) => v.department && set.add(v.department));
    return [...set].sort();
  }, [items]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (department) qs.set('department', department);
      if (sopNo) qs.set('sopNo', sopNo);
      if (version) qs.set('version', version);
      if (fileType) qs.set('fileType', fileType);
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      qs.set('pageSize', '100');
      const res = await fetch(`/api/training-content/videos?${qs.toString()}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const onFilter = (e: React.FormEvent) => { e.preventDefault(); fetchList(); };

  const handleDelete = async (row: VideoRow) => {
    if (!confirm(`Delete "${row.title}"? This removes the file from Bunny CDN.`)) return;
    setDeletingId(row._id);
    try {
      const res = await fetch(`/api/training-content/videos/${row._id}`, { method: 'DELETE' });
      if (res.ok) fetchList();
      else alert('Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const fmtSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const fmtDate = (s: string) => {
    try { return new Date(s).toLocaleDateString(); } catch { return s; }
  };

  const resetFilters = () => {
    setSearch(''); setDepartment(''); setSopNo(''); setVersion('');
    setFileType(''); setDateFrom(''); setDateTo('');
    setTimeout(fetchList, 0);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Film className="h-6 w-6 text-purple-600" /> Training Content
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload, preview and manage NotebookLM-generated training videos. Files are stored on Bunny CDN.
          </p>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-purple-700">
          <Upload className="h-4 w-4" /> Upload Video
        </button>
      </div>

      <form onSubmit={onFilter} className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-white p-3 md:grid-cols-7">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, SOP, description…"
            className="w-full rounded border border-gray-300 pl-7 pr-2 py-1.5 text-sm" />
        </div>
        <select value={department} onChange={(e) => setDepartment(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <input value={sopNo} onChange={(e) => setSopNo(e.target.value)} placeholder="SOP No."
          className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Version"
          className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        <select value={fileType} onChange={(e) => setFileType(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm">
          <option value="">All formats</option>
          {FILE_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded border border-gray-300 px-1 py-1.5 text-xs" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded border border-gray-300 px-1 py-1.5 text-xs" />
        </div>
        <div className="flex gap-2 md:col-span-7">
          <button type="submit" className="rounded bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700">Apply</button>
          <button type="button" onClick={resetFilters} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Reset</button>
          <span className="ml-auto self-center text-xs text-gray-500">{total} video{total === 1 ? '' : 's'}</span>
        </div>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white py-16 text-gray-500">
          <VideoIcon className="mb-2 h-10 w-10 text-gray-400" />
          <p className="text-sm">No training videos yet.</p>
          <button onClick={() => setShowUpload(true)} className="mt-3 rounded bg-purple-600 px-3 py-1.5 text-sm text-white">Upload your first video</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2">Thumbnail</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">SOP / Version</th>
                <th className="px-3 py-2">Format</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {items.map((v) => (
                <tr key={v._id} className="cursor-pointer hover:bg-purple-50/50" onClick={() => setPreview(v)}>
                  <td className="px-3 py-2">
                    <div className="relative h-12 w-20 overflow-hidden rounded bg-gray-200">
                      {v.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-400">
                          <Play className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{v.title}</div>
                    {v.description && <div className="line-clamp-1 text-xs text-gray-500">{v.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{v.department}{v.designation ? ` • ${v.designation}` : ''}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {v.sopNo || '—'}
                    {v.version ? <span className="ml-1 rounded bg-gray-100 px-1 text-xs">v{v.version}</span> : null}
                  </td>
                  <td className="px-3 py-2 uppercase text-gray-700">{v.fileType}</td>
                  <td className="px-3 py-2 text-gray-700">{fmtSize(v.sizeBytes)}</td>
                  <td className="px-3 py-2 text-gray-700">
                    <span className="inline-flex items-center gap-1 text-xs">
                      <Calendar className="h-3 w-3 text-gray-400" /> {fmtDate(v.createdAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <button title="Preview" onClick={() => setPreview(v)}
                        className="rounded p-1.5 text-purple-600 hover:bg-purple-50"><Play className="h-4 w-4" /></button>
                      <button title="Edit" onClick={() => setEditing(v)}
                        className="rounded p-1.5 text-blue-600 hover:bg-blue-50"><Pencil className="h-4 w-4" /></button>
                      <button title="Delete" disabled={deletingId === v._id}
                        onClick={() => handleDelete(v)}
                        className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50">
                        {deletingId === v._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VideoUploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} onSuccess={fetchList} />
      <VideoPreviewModal video={preview} onClose={() => setPreview(null)} />
      <VideoEditModal video={editing} onClose={() => setEditing(null)} onSaved={fetchList} />
    </div>
  );
}
