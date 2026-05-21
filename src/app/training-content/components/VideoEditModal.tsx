'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2, Save, AlertCircle } from 'lucide-react';

interface VideoRow {
  _id: string;
  title: string;
  department: string;
  designation?: string;
  sopNo?: string;
  version?: string;
  description?: string;
}

interface Props {
  video: VideoRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function VideoEditModal({ video, onClose, onSaved }: Props) {
  const [form, setForm] = useState<VideoRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setForm(video); setError(null); }, [video]);

  if (!video || !form) return null;

  const set = (k: keyof VideoRow, v: string) => setForm({ ...form, [k]: v });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/training-content/videos/${form._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          department: form.department,
          designation: form.designation || '',
          sopNo: form.sopNo || '',
          version: form.version || '',
          description: form.description || '',
        }),
      });
      if (!res.ok) {
        const r = await res.json().catch(() => ({}));
        throw new Error(r.error || `Save failed (${res.status})`);
      }
      onSaved(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-lg font-semibold text-gray-800">Edit Training Video</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={save} className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600">Title *</label>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} required
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Department *</label>
              <input value={form.department} onChange={(e) => set('department', e.target.value)} required
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Designation</label>
              <input value={form.designation || ''} onChange={(e) => set('designation', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">SOP No.</label>
              <input value={form.sopNo || ''} onChange={(e) => set('sopNo', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Version</label>
              <input value={form.version || ''} onChange={(e) => set('version', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600">Description</label>
              <textarea value={form.description || ''} onChange={(e) => set('description', e.target.value)} rows={3}
                className="mt-1 w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t pt-3">
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-1 rounded bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
