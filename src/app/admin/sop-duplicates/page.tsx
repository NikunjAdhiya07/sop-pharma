'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, RefreshCw, Trash2, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

interface SOPEntry {
  _id: string;
  name: string;
  identifier: string;
  department: string;
  language: string;
  reviewDate: string | null;
  uploadedAt: string | null;
  version: string | null;
}

interface DuplicateGroup {
  familyKey: string;
  language: string;
  entries: SOPEntry[]; // sorted newest-first; entries[0] = keep, rest = old
}

interface ApiResponse {
  success: boolean;
  totalDuplicateGroups: number;
  totalOldEntries: number;
  duplicates: DuplicateGroup[];
  error?: string;
}

function fmt(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SopDuplicatesPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set()); // IDs of old entries to obsolete
  const [acting, setActing] = useState(false);
  const [result, setResult] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setResult('');
    try {
      const res = await fetch('/api/admin/sop-duplicates');
      const json: ApiResponse = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      setData(json);
      // Auto-select all old entries (everything except entries[0] in each group)
      const autoSelect = new Set<string>();
      for (const group of json.duplicates) {
        for (let i = 1; i < group.entries.length; i++) {
          autoSelect.add(group.entries[i]._id);
        }
      }
      setSelected(autoSelect);
      // Auto-expand all groups
      setExpanded(new Set(json.duplicates.map((g) => `${g.familyKey}::${g.language}`)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleObsolete = async () => {
    if (selected.size === 0) return;
    setActing(true);
    setResult('');
    try {
      const res = await fetch('/api/admin/sop-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'obsolete', ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      setResult(`Marked ${json.count} old SOP${json.count !== 1 ? 's' : ''} as obsolete successfully.`);
      await load();
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    } finally {
      setActing(false);
    }
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Permanently DELETE ${selected.size} old SOP record(s)? This cannot be undone.`)) return;
    setActing(true);
    setResult('');
    try {
      const res = await fetch('/api/admin/sop-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      setResult(`Deleted ${json.count} old SOP record(s) permanently.`);
      await load();
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Duplicate SOP Cleanup</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Find SOPs uploaded multiple times for the same document family. Keep the newest; obsolete or delete the old ones.
            </p>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 text-gray-400 py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Scanning for duplicates…</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 text-red-300 mb-4">
            {error}
          </div>
        )}

        {/* Result banner */}
        {result && (
          <div className={`rounded-lg p-4 mb-4 flex items-center gap-2 ${result.startsWith('Error') ? 'bg-red-900/40 border border-red-700 text-red-300' : 'bg-green-900/40 border border-green-700 text-green-300'}`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {result}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Summary bar */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex flex-wrap items-center gap-6">
              <div>
                <div className="text-2xl font-bold text-white">{data.totalDuplicateGroups}</div>
                <div className="text-xs text-gray-400 mt-0.5">Duplicate Groups</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-400">{data.totalOldEntries}</div>
                <div className="text-xs text-gray-400 mt-0.5">Old Entries to Clean Up</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">{selected.size}</div>
                <div className="text-xs text-gray-400 mt-0.5">Selected for Action</div>
              </div>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <button
                  onClick={load}
                  disabled={loading || acting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
                {data.totalDuplicateGroups > 0 && (
                  <>
                    <button
                      onClick={handleObsolete}
                      disabled={selected.size === 0 || acting}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                      Mark {selected.size} Old as Obsolete
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={selected.size === 0 || acting}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Selected
                    </button>
                  </>
                )}
              </div>
            </div>

            {data.totalDuplicateGroups === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-600" />
                <div className="text-lg font-medium text-gray-300">No duplicates found</div>
                <div className="text-sm mt-1">All SOP families have a single active record.</div>
              </div>
            ) : (
              <div className="space-y-3">
                {data.duplicates.map((group) => {
                  const key = `${group.familyKey}::${group.language}`;
                  const isExpanded = expanded.has(key);
                  const newest = group.entries[0];
                  const oldEntries = group.entries.slice(1);
                  const oldSelectedCount = oldEntries.filter((e) => selected.has(e._id)).length;

                  return (
                    <div key={key} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      {/* Group header */}
                      <button
                        className="w-full flex items-center gap-3 p-4 hover:bg-gray-800/50 transition-colors text-left"
                        onClick={() => toggleExpand(key)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-indigo-400">{group.familyKey.replace(':', '')}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{group.language}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-400">
                              {group.entries.length} versions
                            </span>
                          </div>
                          <div className="text-sm text-gray-300 mt-0.5 truncate">{newest.name}</div>
                        </div>
                        <div className="text-xs text-gray-500 shrink-0">
                          {oldSelectedCount}/{oldEntries.length} old selected
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-800">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-gray-500 border-b border-gray-800">
                                <th className="px-4 py-2 text-left">Select</th>
                                <th className="px-4 py-2 text-left">Status</th>
                                <th className="px-4 py-2 text-left">Identifier</th>
                                <th className="px-4 py-2 text-left">Review Date</th>
                                <th className="px-4 py-2 text-left">Uploaded</th>
                                <th className="px-4 py-2 text-left">Version</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.entries.map((entry, idx) => {
                                const isNewest = idx === 0;
                                const isSelected = selected.has(entry._id);
                                return (
                                  <tr
                                    key={entry._id}
                                    className={`border-b border-gray-800/50 last:border-0 ${isNewest ? 'bg-green-950/20' : isSelected ? 'bg-amber-950/20' : ''}`}
                                  >
                                    <td className="px-4 py-2.5">
                                      {isNewest ? (
                                        <span className="text-xs text-green-500 font-medium">KEEP</span>
                                      ) : (
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleSelect(entry._id)}
                                          className="accent-amber-500 w-4 h-4 cursor-pointer"
                                        />
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      {isNewest ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-green-400">
                                          <CheckCircle2 className="w-3 h-3" /> Newest
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                                          <AlertTriangle className="w-3 h-3" /> Old
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-gray-300">{entry.identifier}</td>
                                    <td className={`px-4 py-2.5 text-xs ${isNewest ? 'text-green-400 font-medium' : 'text-red-400'}`}>
                                      {fmt(entry.reviewDate)}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-gray-400">{fmt(entry.uploadedAt)}</td>
                                    <td className="px-4 py-2.5 text-xs text-gray-500">{entry.version ?? '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
