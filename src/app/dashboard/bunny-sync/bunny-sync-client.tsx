'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  CloudOff,
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertTriangle,
  Database,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { BunnySyncRow } from '@/app/api/dashboard/bunny-sync/route';

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanStatus = 'idle' | 'scanning' | 'syncing' | 'done';

type FilterStatus = 'all' | 'missing' | 'found' | 'not_bunny' | 'empty';

interface ScanResult {
  total: number;
  bunnyPaths: number;
  found: number;
  missing: number;
  notBunny: number;
  empty: number;
  dbCleared?: number;
  rows: BunnySyncRow[];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number | string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className={`rounded-lg p-2 ${color}`}>{icon}</div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="text-2xl font-bold tabular-nums text-gray-800">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BunnySyncRow['status'] }) {
  switch (status) {
    case 'found':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-3 w-3" /> Found
        </span>
      );
    case 'missing':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
          <XCircle className="h-3 w-3" /> Missing
        </span>
      );
    case 'not_bunny':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200">
          <MinusCircle className="h-3 w-3" /> Not Bunny
        </span>
      );
    case 'empty':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
          <AlertTriangle className="h-3 w-3" /> Empty
        </span>
      );
  }
}

function SourceBadge({ source }: { source: BunnySyncRow['source'] }) {
  const map: Record<BunnySyncRow['source'], { label: string; cls: string }> = {
    sop: { label: 'SOP', cls: 'bg-purple-50 text-purple-700 ring-purple-200' },
    library: { label: 'Library', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
    version: { label: 'Version', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
    supersede: { label: 'Supersede', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
  };
  const { label, cls } = map[source];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BunnySyncClient() {
  useAuthGuard({ allowedRoles: ['admin', 'qa-head'] });
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof BunnySyncRow>('identifier');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [syncDone, setSyncDone] = useState(false);
  const [dbCleared, setDbCleared] = useState<number | null>(null);

  // ── Scan (GET — no DB writes) ───────────────────────────────────────────────

  async function handleScan() {
    setScanStatus('scanning');
    setError(null);
    setSyncDone(false);
    setDbCleared(null);
    try {
      const res = await fetch('/api/dashboard/bunny-sync', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Scan failed');
      setResult(json as ScanResult);
      setFilterStatus(json.missing > 0 ? 'missing' : 'all');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setScanStatus('done');
    }
  }

  // ── Sync (POST — updates DB) ────────────────────────────────────────────────

  async function handleSync() {
    if (!result || result.missing === 0) return;
    setScanStatus('syncing');
    setError(null);
    try {
      const res = await fetch('/api/dashboard/bunny-sync', {
        method: 'POST',
        cache: 'no-store',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Sync failed');
      setResult(json as ScanResult);
      setDbCleared(json.dbCleared ?? 0);
      setSyncDone(true);
      setFilterStatus('all');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setScanStatus('done');
    }
  }

  // ── Sorting ─────────────────────────────────────────────────────────────────

  function toggleSort(key: keyof BunnySyncRow) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // ── Filtered + sorted rows ──────────────────────────────────────────────────

  const visibleRows = useMemo(() => {
    if (!result) return [];
    let rows = result.rows;

    if (filterStatus !== 'all') {
      rows = rows.filter((r) => r.status === filterStatus);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.identifier.toLowerCase().includes(q) ||
          (r.name || '').toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.dbPath.toLowerCase().includes(q),
      );
    }

    rows = [...rows].sort((a, b) => {
      const av = String(a[sortKey] ?? '');
      const bv = String(b[sortKey] ?? '');
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    return rows;
  }, [result, filterStatus, search, sortKey, sortDir]);

  const isLoading = scanStatus === 'scanning' || scanStatus === 'syncing';

  // ── Filter tab counts ───────────────────────────────────────────────────────

  const counts = useMemo(() => {
    if (!result) return null;
    return {
      all: result.rows.length,
      missing: result.missing,
      found: result.found,
      not_bunny: result.notBunny,
      empty: result.empty,
    };
  }, [result]);

  // ── Sort icon ───────────────────────────────────────────────────────────────

  function SortIcon({ col }: { col: keyof BunnySyncRow }) {
    if (sortKey !== col) return <ChevronDown className="h-3 w-3 text-gray-300" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3 text-purple-600" />
    ) : (
      <ChevronDown className="h-3 w-3 text-purple-600" />
    );
  }

  function ThBtn({
    col,
    children,
    className = '',
  }: {
    col: keyof BunnySyncRow;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={`flex items-center gap-1 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 ${className}`}
      >
        {children} <SortIcon col={col} />
      </button>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-screen-xl">
          <Link
            href="/dashboard"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
                <CloudOff className="h-5 w-5 text-purple-600" />
                Bunny Storage Sync
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Scan every file URL stored in the database and verify it still exists on Bunny
                Storage. Then sync the database to remove ghost references.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleScan}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${scanStatus === 'scanning' ? 'animate-spin' : ''}`} />
                {scanStatus === 'scanning' ? 'Scanning…' : 'Scan Bunny'}
              </button>

              {result && result.missing > 0 && !syncDone && (
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
                >
                  <Database className={`h-4 w-4 ${scanStatus === 'syncing' ? 'animate-pulse' : ''}`} />
                  {scanStatus === 'syncing'
                    ? 'Syncing…'
                    : `Sync DB (clear ${result.missing} missing)`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-screen-xl px-6 py-6 space-y-6">
        {/* ── Error ── */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* ── Sync success banner ── */}
        {syncDone && dbCleared !== null && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <strong>Sync complete.</strong> {dbCleared} database record
            {dbCleared !== 1 ? 's' : ''} updated. All ghost file references have been cleared.
          </div>
        )}

        {/* ── Idle state ── */}
        {scanStatus === 'idle' && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-8 py-16 text-center">
            <CloudOff className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">
              Click <strong>Scan Bunny</strong> to check every file URL in the database against
              Bunny Storage.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              This checks SOP records, Library documents, Version artifacts, and Superseded
              versions — without modifying anything.
            </p>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {isLoading && (
          <div className="rounded-xl border border-gray-200 bg-white px-8 py-16 text-center">
            <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-purple-400" />
            <p className="text-sm font-medium text-gray-500">
              {scanStatus === 'scanning'
                ? 'Checking every file against Bunny Storage API — this may take a minute…'
                : 'Syncing database — clearing ghost references…'}
            </p>
          </div>
        )}

        {/* ── Results ── */}
        {result && !isLoading && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="Total Rows"
                value={result.total}
                color="bg-gray-100"
                icon={<Database className="h-4 w-4 text-gray-600" />}
              />
              <StatCard
                label="Bunny Paths"
                value={result.bunnyPaths}
                color="bg-purple-100"
                icon={<CloudOff className="h-4 w-4 text-purple-600" />}
              />
              <StatCard
                label="Found"
                value={result.found}
                color="bg-emerald-100"
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              />
              <StatCard
                label="Missing"
                value={result.missing}
                color="bg-red-100"
                icon={<XCircle className="h-4 w-4 text-red-600" />}
              />
              <StatCard
                label="Not Bunny"
                value={result.notBunny}
                color="bg-gray-100"
                icon={<MinusCircle className="h-4 w-4 text-gray-500" />}
              />
              <StatCard
                label="Empty URL"
                value={result.empty}
                color="bg-amber-100"
                icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
              />
            </div>

            {/* Filter tabs + search */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-gray-200">
                {(
                  [
                    { key: 'all', label: 'All' },
                    { key: 'missing', label: 'Missing' },
                    { key: 'found', label: 'Found' },
                    { key: 'not_bunny', label: 'Not Bunny' },
                    { key: 'empty', label: 'Empty' },
                  ] as { key: FilterStatus; label: string }[]
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterStatus(key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      filterStatus === key
                        ? 'bg-purple-600 text-white shadow'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {label}
                    {counts && (
                      <span
                        className={`ml-1.5 tabular-nums ${
                          filterStatus === key ? 'opacity-80' : 'text-gray-400'
                        }`}
                      >
                        {counts[key]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search identifier, name, path…"
                  className="rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-800 placeholder-gray-400 shadow-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <ThBtn col="source">Source</ThBtn>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <ThBtn col="identifier">Identifier</ThBtn>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <ThBtn col="name">Name</ThBtn>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <ThBtn col="department">Dept</ThBtn>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <ThBtn col="fileType">Type</ThBtn>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          DB Path
                        </span>
                      </th>
                      <th className="px-4 py-3 text-left">
                        <ThBtn col="status">Status</ThBtn>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-sm text-gray-400">
                          No rows match your filter.
                        </td>
                      </tr>
                    ) : (
                      visibleRows.map((row) => (
                        <tr
                          key={row.key}
                          className={`transition hover:bg-gray-50 ${
                            row.status === 'missing' ? 'bg-red-50/30' : ''
                          }`}
                        >
                          <td className="px-4 py-2.5">
                            <SourceBadge source={row.source} />
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-gray-800">
                            {row.identifier}
                            {row.version != null && (
                              <span className="ml-1 text-gray-400">v{row.version}</span>
                            )}
                          </td>
                          <td className="max-w-[180px] truncate px-4 py-2.5 text-gray-700">
                            {row.name || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">
                            {row.department || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {row.fileType ? (
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600 uppercase">
                                {row.fileType}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="max-w-[280px] px-4 py-2.5">
                            {row.dbPath ? (
                              <span
                                className="block truncate font-mono text-xs text-gray-500"
                                title={row.dbPath}
                              >
                                {row.dbPath}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300 italic">empty</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={row.status} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {visibleRows.length > 0 && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-400">
                  Showing {visibleRows.length} of {result.rows.length} rows
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
