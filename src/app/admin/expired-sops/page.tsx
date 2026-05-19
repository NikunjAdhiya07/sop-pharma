'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Upload,
} from 'lucide-react';

interface ExpiredSopRow {
  _id: string;
  identifier: string;
  name: string;
  department: string;
  language: string;
  reviewDate: string | null;
  daysOverdue: number;
  hasDocx: boolean;
}

interface ListResponse {
  success: boolean;
  total: number;
  expired: ExpiredSopRow[];
  error?: string;
}

interface RecheckResult {
  identifier: string;
  status: 'updated' | 'unchanged' | 'skipped' | 'error';
  message: string;
  previousReviewDate?: string | null;
  extractedReviewDate?: string | null;
  previousEffectiveDate?: string | null;
  extractedEffectiveDate?: string | null;
  dateSource?: string;
  headerTable?: {
    sopNo: string | null;
    effDate: string | null;
    reviewDate: string | null;
    expiryDate: string | null;
  } | null;
  docxPath?: string | null;
}

function fmt(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function datesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

function DateChangeRow({
  label,
  from,
  to,
  highlight,
}: {
  label: string;
  from: string | null | undefined;
  to: string | null | undefined;
  highlight: boolean;
}) {
  const changed = !datesEqual(from, to);
  if (!from && !to) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs mt-1">
      <span className="text-gray-500 w-24 shrink-0">{label}</span>
      {changed ? (
        <>
          <span className="line-through text-red-400/90">{fmt(from)}</span>
          <span className="text-gray-600">→</span>
          <span className={`font-semibold ${highlight ? 'text-emerald-300' : 'text-gray-300'}`}>
            {fmt(to)}
          </span>
        </>
      ) : (
        <span className="text-gray-400">{fmt(to ?? from)} (no change)</span>
      )}
    </div>
  );
}

function RecheckResultCard({ r }: { r: RecheckResult }) {
  const hasDates =
    r.previousReviewDate ||
    r.extractedReviewDate ||
    r.previousEffectiveDate ||
    r.extractedEffectiveDate;
  const headerHasAnything =
    r.headerTable &&
    (r.headerTable.sopNo ||
      r.headerTable.effDate ||
      r.headerTable.reviewDate ||
      r.headerTable.expiryDate);

  return (
    <div
      className={`p-3 rounded-lg border ${
        r.status === 'updated'
          ? 'border-green-700 bg-green-950/50'
          : r.status === 'error'
            ? 'border-red-700 bg-red-950/50'
            : r.status === 'skipped'
              ? 'border-amber-800 bg-amber-950/30'
              : 'border-gray-700 bg-gray-800/40'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="font-mono font-bold text-sm text-white">{r.identifier}</span>
        <span
          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
            r.status === 'updated'
              ? 'bg-green-800 text-green-200'
              : r.status === 'error'
                ? 'bg-red-800 text-red-200'
                : r.status === 'skipped'
                  ? 'bg-amber-800 text-amber-200'
                  : 'bg-gray-700 text-gray-300'
          }`}
        >
          {r.status}
        </span>
        {r.dateSource && (
          <span className="text-[10px] text-gray-500 italic">via {r.dateSource}</span>
        )}
      </div>
      <p className="text-xs text-gray-400">{r.message}</p>
      {hasDates && (
        <div className="mt-2 pt-2 border-t border-gray-700/60">
          <DateChangeRow
            label="Review date"
            from={r.previousReviewDate}
            to={r.extractedReviewDate}
            highlight={r.status === 'updated'}
          />
          {(r.previousEffectiveDate || r.extractedEffectiveDate) && (
            <DateChangeRow
              label="Effective"
              from={r.previousEffectiveDate}
              to={r.extractedEffectiveDate}
              highlight={r.status === 'updated'}
            />
          )}
        </div>
      )}
      {r.headerTable && (
        <div className="mt-2 pt-2 border-t border-gray-700/60">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">
            DOCX header table values
          </p>
          {headerHasAnything ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <span className="text-gray-500">SOP NO.</span>
              <span className="font-mono text-gray-300">{r.headerTable.sopNo || '—'}</span>
              <span className="text-gray-500">EFF. DATE</span>
              <span className="font-mono text-gray-300">{r.headerTable.effDate || '(empty)'}</span>
              <span className="text-gray-500">REVIEW DT.</span>
              <span className="font-mono text-gray-300">{r.headerTable.reviewDate || '(empty)'}</span>
              <span className="text-gray-500">EXPIRY</span>
              <span className="font-mono text-gray-300">{r.headerTable.expiryDate || '(empty)'}</span>
            </div>
          ) : (
            <p className="text-[11px] text-amber-400">
              Header table not found in DOCX — file may not match the SOP template.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function UploadDocxButton({
  row,
  disabled,
  onResult,
}: {
  row: ExpiredSopRow;
  disabled: boolean;
  onResult: (result: RecheckResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('sopId', row._id);
      form.append('file', file);
      const res = await fetch('/api/admin/expired-sops/upload', {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!json.success) {
        onResult({
          identifier: row.identifier,
          status: 'error',
          message: json.error || 'Upload failed',
        });
        return;
      }
      onResult(json.result as RecheckResult);
    } catch (e: unknown) {
      onResult({
        identifier: row.identifier,
        status: 'error',
        message: e instanceof Error ? e.message : 'Upload failed',
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-blue-700/60 bg-blue-900/30 text-blue-200 hover:bg-blue-900/60 transition-colors disabled:opacity-50"
        title="Upload a DOCX with filled-in dates to update this SOP"
      >
        {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
        Upload DOCX
      </button>
    </>
  );
}

export default function ExpiredSopsPage() {
  useAuthGuard({ allowedRoles: ['admin', 'qa-head'] });

  const [rows, setRows] = useState<ExpiredSopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rechecking, setRechecking] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [recheckResults, setRecheckResults] = useState<RecheckResult[] | null>(null);
  const [search, setSearch] = useState('');

  const [resultFilter, setResultFilter] = useState<
    'all' | 'updated' | 'unchanged' | 'skipped' | 'error'
  >('all');

  const load = useCallback(async (opts?: { keepRecheckResults?: boolean }) => {
    setLoading(true);
    setError('');
    if (!opts?.keepRecheckResults) {
      setBanner(null);
      setRecheckResults(null);
    }
    try {
      const res = await fetch('/api/admin/expired-sops');
      const json: ListResponse = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load');
      setRows(json.expired);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.identifier.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q)
    );
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAllVisible = () => {
    setSelectedIds(filtered.map((r) => r._id));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const runRecheck = async (opts: { all?: boolean; sopIds?: string[] }) => {
    setRechecking(true);
    setBanner(null);
    setRecheckResults(null);
    try {
      const res = await fetch('/api/admin/expired-sops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Recheck failed');

      const { summary, results } = json;
      setRecheckResults(results);
      setResultFilter(summary.updated > 0 ? 'updated' : 'all');
      setBanner({
        ok: summary.errors === 0,
        msg:
          summary.updated > 0
            ? `Updated ${summary.updated} SOP(s) — see changes below (${summary.unchanged} unchanged, ${summary.skipped} skipped, ${summary.errors} errors).`
            : `Recheck complete: ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.skipped} skipped, ${summary.errors} errors.`,
      });
      await load({ keepRecheckResults: true });
    } catch (e: unknown) {
      setBanner({
        ok: false,
        msg: e instanceof Error ? e.message : 'Recheck failed',
      });
    } finally {
      setRechecking(false);
    }
  };

  const handleRecheckSelected = () => {
    if (selectedIds.length === 0) return;
    void runRecheck({ sopIds: selectedIds });
  };

  const handleRecheckAll = () => {
    if (!confirm(`Re-read review dates from DOCX for all ${rows.length} expired SOP(s)?`)) return;
    void runRecheck({ all: true });
  };

  const handleUploadResult = (result: RecheckResult) => {
    setRecheckResults((prev) => {
      const next = prev ? prev.filter((r) => r.identifier !== result.identifier) : [];
      return [result, ...next];
    });
    setResultFilter('all');
    setBanner({
      ok: result.status === 'updated',
      msg:
        result.status === 'updated'
          ? `${result.identifier}: updated from uploaded DOCX.`
          : `${result.identifier}: ${result.message}`,
    });
    if (result.status === 'updated') {
      void load({ keepRecheckResults: true });
    }
  };

  const selectedCount = selectedIds.length;
  const selectedRows = filtered.filter((r) => selectedIds.includes(r._id));
  const selectedWithoutDocx = selectedRows.filter((r) => !r.hasDocx).length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              Expired SOPs
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              SOPs whose review date has passed (same logic as the dashboard).
              <strong className="text-gray-300"> Reconfigure</strong> reads dates from the stored DOCX.
              If the stored DOCX has empty date cells, use the per-row
              <strong className="text-blue-300"> Upload DOCX</strong> button to update from a new file.
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-gray-400 py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading expired SOPs…</span>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 text-red-300 mb-4">
            {error}
          </div>
        )}

        {banner && (
          <div
            className={`rounded-lg p-4 mb-4 flex items-start gap-2 text-sm ${
              banner.ok
                ? 'bg-green-900/40 border border-green-700 text-green-300'
                : 'bg-amber-900/40 border border-amber-700 text-amber-300'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{banner.msg}</span>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex flex-wrap items-center gap-4">
              <div>
                <div className="text-3xl font-bold text-red-400">{rows.length}</div>
                <div className="text-xs text-gray-400 mt-0.5">Expired SOPs</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-blue-400">{selectedCount}</div>
                <div className="text-xs text-gray-400 mt-0.5">Selected</div>
              </div>
              <div className="flex-1 min-w-[200px]">
                <input
                  type="search"
                  placeholder="Search identifier, name, department…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex flex-wrap gap-2 ml-auto">
                <button
                  onClick={() => void load()}
                  disabled={loading || rechecking}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
                <button
                  onClick={selectAllVisible}
                  disabled={rechecking || filtered.length === 0}
                  className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  Select all
                </button>
                <button
                  onClick={clearSelection}
                  disabled={rechecking || selectedCount === 0}
                  className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  Clear
                </button>
                <button
                  onClick={handleRecheckSelected}
                  disabled={rechecking || selectedCount === 0}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-50"
                  title={
                    selectedWithoutDocx > 0
                      ? `${selectedWithoutDocx} selected row(s) may have no DOCX on file`
                      : undefined
                  }
                >
                  {rechecking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Calendar className="w-4 h-4" />
                  )}
                  Reconfigure selected ({selectedCount})
                </button>
                <button
                  onClick={handleRecheckAll}
                  disabled={rechecking || rows.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-purple-700 hover:bg-purple-600 rounded-lg transition-colors disabled:opacity-50"
                >
                  {rechecking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  Reconfigure all
                </button>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
                <p className="text-lg font-medium text-gray-300">No expired SOPs</p>
                <p className="text-sm mt-1">All SOPs are within their review period.</p>
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/80 sticky top-0 z-10">
                      <tr className="text-left text-gray-400 text-xs uppercase tracking-wider">
                        <th className="p-3 w-10" />
                        <th className="p-3">Identifier</th>
                        <th className="p-3">Name</th>
                        <th className="p-3">Department</th>
                        <th className="p-3">Review date</th>
                        <th className="p-3">Overdue</th>
                        <th className="p-3">DOCX</th>
                        <th className="p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {filtered.map((row) => (
                        <tr
                          key={row._id}
                          className="hover:bg-gray-800/50 transition-colors"
                        >
                          <td className="p-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(row._id)}
                              disabled={rechecking}
                              onChange={() => toggleSelect(row._id)}
                              className="h-4 w-4 rounded border-gray-500 bg-gray-800 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Select ${row.identifier}`}
                            />
                          </td>
                          <td className="p-3 font-mono text-purple-300">{row.identifier}</td>
                          <td className="p-3 text-gray-200 max-w-xs truncate" title={row.name}>
                            {row.name}
                          </td>
                          <td className="p-3 text-gray-400">{row.department || '—'}</td>
                          <td className="p-3 text-red-300">{fmt(row.reviewDate)}</td>
                          <td className="p-3">
                            <span className="text-red-400 font-semibold">
                              {row.daysOverdue} day{row.daysOverdue !== 1 ? 's' : ''}
                            </span>
                          </td>
                          <td className="p-3">
                            {row.hasDocx ? (
                              <span className="text-green-400 text-xs">Available</span>
                            ) : (
                              <span className="text-amber-500 text-xs" title="PDF-only or missing file">
                                No DOCX
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <UploadDocxButton
                              row={row}
                              disabled={rechecking}
                              onResult={handleUploadResult}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filtered.length === 0 && search && (
                  <p className="p-6 text-center text-gray-500">No matches for &quot;{search}&quot;</p>
                )}
              </div>
            )}

            {recheckResults && recheckResults.length > 0 && (
              <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h2 className="text-sm font-bold text-gray-200">
                    Recheck results — what changed
                  </h2>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ['all', recheckResults.length],
                        ['updated', recheckResults.filter((r) => r.status === 'updated').length],
                        ['unchanged', recheckResults.filter((r) => r.status === 'unchanged').length],
                        ['skipped', recheckResults.filter((r) => r.status === 'skipped').length],
                        ['error', recheckResults.filter((r) => r.status === 'error').length],
                      ] as const
                    ).map(([key, count]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setResultFilter(key)}
                        className={`px-2.5 py-1 text-xs rounded-md capitalize transition-colors ${
                          resultFilter === key
                            ? 'bg-purple-700 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        {key} ({count})
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 max-h-[min(24rem,50vh)] overflow-y-auto">
                  {recheckResults
                    .filter((r) => resultFilter === 'all' || r.status === resultFilter)
                    .map((r) => (
                      <RecheckResultCard key={`${r.identifier}-${r.status}`} r={r} />
                    ))}
                </div>
                {recheckResults.some((r) => r.status === 'updated') && (
                  <p className="mt-3 text-xs text-gray-500">
                    Strikethrough = previous value in database. Green = new value from DOCX.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
