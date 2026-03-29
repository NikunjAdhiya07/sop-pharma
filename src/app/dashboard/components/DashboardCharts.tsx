"use client";

import { useMemo, useState, useId, type ComponentType } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  LayoutGrid,
  ShieldAlert,
  FolderOpen,
  Sparkles,
  ArrowDownWideNarrow,
  Percent,
  Hash,
} from "lucide-react";
import type {
  CapsuleFilterMode,
  CapsuleAvailMetric,
} from "./DepartmentCapsules";
import {
  aggregateDepartmentDistribution,
  aggregateDualLanguageByDept,
  aggregateExpiryStatusGlobal,
  aggregateExpiryTimeline,
  aggregateFileTypesAndGaps,
  aggregateMissingInsights,
  aggregateVersionBuckets,
} from "@/lib/dashboardChartAggregates";

type ExpiryChartKey =
  | "all"
  | "expired"
  | "high"
  | "medium"
  | "soon90"
  | "nodate";

type Props = {
  data: any[];
  applyCapsuleFilter: (dept: string, mode: CapsuleFilterMode) => void;
  applyCapsuleAvailMiss: (
    dept: string,
    metric: CapsuleAvailMetric,
    side: "available" | "missing",
  ) => void;
  applyChartExpiryFilter: (key: ExpiryChartKey, department?: string) => void;
};

const GRADIENT_PURPLE = ["#a78bfa", "#6d28d9"];
const RISK = { active: "#059669", near: "#f59e0b", expired: "#dc2626" };

function tipN(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function DepartmentTooltip({
  active,
  payload,
  deptMode,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: Record<string, unknown> }>;
  label?: string | number;
  deptMode: "count" | "percent";
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as {
    department?: string;
    total?: number;
    pct?: number;
    expired?: number;
    nearExpiry?: number;
    active?: number;
  };
  const d = p.department ?? "";
  return (
    <div className="rounded-xl border border-purple-100 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <p className="font-bold text-gray-900">{d}</p>
      <p className="mt-1 tabular-nums text-gray-700">
        <span className="text-gray-500">Total: </span>
        {deptMode === "percent"
          ? `${p.pct ?? 0}% of named-dept SOPs`
          : `${p.total ?? 0} SOPs`}
      </p>
      <div className="mt-1.5 space-y-0.5 border-t border-gray-100 pt-1.5 text-[11px] tabular-nums">
        <p>
          <span className="text-emerald-700">Active: </span>
          {p.active ?? 0}
        </p>
        <p>
          <span className="text-amber-700">Near (≤30d): </span>
          {p.nearExpiry ?? 0}
        </p>
        <p>
          <span className="text-red-700">Expired: </span>
          {p.expired ?? 0}
        </p>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8 last:mb-0">
      <div className="mb-4 flex items-start gap-2 border-b border-gray-200/80 pb-2">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-indigo-700 text-white shadow-md">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <h2 className="text-sm font-bold tracking-tight text-gray-900">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] text-gray-500">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function InsightCard({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: "slate" | "amber" | "rose" | "violet";
  onClick?: () => void;
}) {
  const tones = {
    slate:
      "border-slate-200/80 bg-gradient-to-br from-slate-50 to-white hover:border-slate-300",
    amber:
      "border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white hover:border-amber-300",
    rose: "border-rose-200/80 bg-gradient-to-br from-rose-50/90 to-white hover:border-rose-300",
    violet:
      "border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white hover:border-violet-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex min-h-[88px] flex-col rounded-xl border px-3 py-2.5 text-left shadow-sm transition-all ${tones[tone]} ${
        onClick ? "cursor-pointer hover:shadow-md" : "cursor-default"
      }`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <span className="mt-1 text-2xl font-black tabular-nums text-gray-900">
        {value}
      </span>
      {sub ? (
        <span className="mt-0.5 text-[10px] text-gray-500">{sub}</span>
      ) : null}
    </button>
  );
}

export default function DashboardCharts({
  data,
  applyCapsuleFilter,
  applyCapsuleAvailMiss,
  applyChartExpiryFilter,
}: Props) {
  const uid = useId();
  const gradBar = `${uid}-bar`;
  const gradArea = `${uid}-area`;

  const [deptSortDesc, setDeptSortDesc] = useState(true);
  const [deptMode, setDeptMode] = useState<"count" | "percent">("count");

  const deptRaw = useMemo(() => aggregateDepartmentDistribution(data), [data]);
  const deptSum = useMemo(
    () => deptRaw.reduce((a, d) => a + d.total, 0),
    [deptRaw],
  );

  const deptBarData = useMemo(() => {
    const rows = deptRaw.map((d) => ({
      ...d,
      pct: deptSum > 0 ? Math.round((d.total / deptSum) * 1000) / 10 : 0,
      shortLabel:
        d.department.length > 14
          ? d.department.slice(0, 12) + "…"
          : d.department,
    }));
    const sorted = [...rows].sort((a, b) =>
      deptSortDesc ? b.total - a.total : a.total - b.total,
    );
    return sorted;
  }, [deptRaw, deptSortDesc, deptSum]);

  const expiryGlobal = useMemo(() => aggregateExpiryStatusGlobal(data), [data]);
  const versionBuckets = useMemo(() => aggregateVersionBuckets(data), [data]);
  const fileTypes = useMemo(() => aggregateFileTypesAndGaps(data), [data]);
  const fileBarData = useMemo(
    () => [
      { name: "DOCX", n: fileTypes.withDocx, fill: "#2563eb" },
      { name: "PDF", n: fileTypes.withPdf, fill: "#dc2626" },
      { name: "Videos", n: fileTypes.withVideo, fill: "#7c3aed" },
      { name: "Slides", n: fileTypes.withSlides, fill: "#db2777" },
    ],
    [fileTypes],
  );
  const timeline = useMemo(() => aggregateExpiryTimeline(data), [data]);
  const dualDept = useMemo(() => aggregateDualLanguageByDept(data), [data]);
  const missing = useMemo(() => aggregateMissingInsights(data), [data]);

  const stackedCompliance = useMemo(
    () =>
      deptRaw.map((d) => ({
        department:
          d.department.length > 12
            ? d.department.slice(0, 10) + "…"
            : d.department,
        fullDept: d.department,
        active: d.active,
        nearExpiry: d.nearExpiry,
        expired: d.expired,
      })),
    [deptRaw],
  );

  const isEmpty = data.length === 0;

  const pieData = expiryGlobal.slices;

  return (
    <div className="mx-auto max-w-[1920px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple-200/60 bg-gradient-to-r from-purple-50/90 via-white to-indigo-50/80 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600" aria-hidden />
          <div>
            <p className="text-sm font-bold text-gray-900">
              Analytics dashboard
            </p>
            <p className="text-[11px] text-gray-600">
              {isEmpty ? "No data" : `${data.length} SOPs in registry`} — same
              source as the table below
            </p>
          </div>
        </div>
      </div>

      {/* Overview */}
      <Section
        icon={LayoutGrid}
        title="Overview"
        subtitle="Department load, expiry mix, and quick gap signals">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* Enhanced department bar */}
          <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-md shadow-gray-200/40 xl:col-span-7">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-600">
                  Department distribution
                </p>
                <p className="text-[10px] text-gray-500">
                  Named departments only (aligned with department capsules)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDeptSortDesc((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-700 hover:bg-gray-100">
                  <ArrowDownWideNarrow className="h-3 w-3" />
                  {deptSortDesc ? "High → low" : "Low → high"}
                </button>
                <div className="flex rounded-lg border border-gray-200 p-0.5">
                  <button
                    type="button"
                    onClick={() => setDeptMode("count")}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${
                      deptMode === "count"
                        ? "bg-purple-600 text-white"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}>
                    <Hash className="h-3 w-3" /> Count
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeptMode("percent")}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${
                      deptMode === "percent"
                        ? "bg-purple-600 text-white"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}>
                    <Percent className="h-3 w-3" /> %
                  </button>
                </div>
              </div>
            </div>
            <div className="h-[280px] w-full min-w-0">
              {isEmpty ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  No data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={deptBarData}
                    margin={{ top: 8, right: 16, left: 4, bottom: 56 }}>
                    <defs>
                      <linearGradient id={gradBar} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={GRADIENT_PURPLE[0]} />
                        <stop offset="100%" stopColor={GRADIENT_PURPLE[1]} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e5e7eb"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fontSize: 10, fill: "#4b5563" }}
                      angle={-32}
                      textAnchor="end"
                      height={70}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      width={36}
                      tickFormatter={(v) =>
                        deptMode === "percent" ? `${v}%` : v
                      }
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(124, 58, 237, 0.06)" }}
                      content={(props) => (
                        <DepartmentTooltip {...props} deptMode={deptMode} />
                      )}
                    />
                    <Bar
                      dataKey={deptMode === "percent" ? "pct" : "total"}
                      name={
                        deptMode === "percent" ? "% of named-dept SOPs" : "SOPs"
                      }
                      fill={`url(#${gradBar})`}
                      radius={[8, 8, 0, 0]}
                      maxBarSize={48}
                      onClick={(e: any) => {
                        const d = e?.payload?.department;
                        if (d) applyCapsuleFilter(d, "all");
                      }}
                      className="cursor-pointer outline-none"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <p className="mt-2 text-center text-[10px] text-gray-500">
              Click a bar to filter the registry to that department
            </p>
          </div>

          {/* Donut + file mix */}
          <div className="flex flex-col gap-4 xl:col-span-5">
            <div className="relative rounded-2xl border border-gray-200/90 bg-white p-4 shadow-md">
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-600">
                SOP status
              </p>
              <p className="mb-2 text-[10px] text-gray-500">
                Near expiry = within 30 days (matches capsules)
              </p>
              <div className="relative h-[240px]">
                {isEmpty || pieData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">
                    No data
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={62}
                          outerRadius={92}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                          animationBegin={0}
                          animationDuration={800}
                          onClick={(d: { name?: string }) => {
                            const name = d?.name ?? "";
                            if (name.includes("Expired"))
                              applyChartExpiryFilter("expired");
                            else if (name.includes("Near"))
                              applyChartExpiryFilter("high");
                            else applyChartExpiryFilter("all");
                          }}>
                          {pieData.map((entry, i) => (
                            <Cell
                              key={`c-${i}`}
                              fill={entry.color}
                              stroke="#fff"
                              strokeWidth={2}
                              className="cursor-pointer"
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: unknown) => [tipN(v), "SOPs"]}
                          contentStyle={{ borderRadius: 12, fontSize: 12 }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-2">
                      <span className="text-3xl font-black tabular-nums text-gray-900">
                        {expiryGlobal.total}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Total SOPs
                      </span>
                    </div>
                  </>
                )}
              </div>
              <p className="mt-1 text-center text-[10px] text-gray-500">
                Click a segment: Expired / Near → filter; Active → clear expiry
                filter
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-md">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-600">
                File & media coverage
              </p>
              <div className="h-[180px]">
                {isEmpty ? (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">
                    No data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={fileBarData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e5e7eb"
                        vertical={false}
                      />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} width={32} />
                      <Tooltip
                        formatter={(v: unknown) => [tipN(v), "SOPs with ≥1"]}
                      />
                      <Bar
                        dataKey="n"
                        radius={[6, 6, 0, 0]}
                        animationDuration={700}
                        label={{
                          position: "top",
                          fontSize: 11,
                          fill: "#374151",
                        }}>
                        {fileBarData.map((entry, index) => (
                          <Cell key={`ft-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <p className="mt-1 text-[10px] leading-snug text-gray-500">
                Counts how many SOP rows have at least one attachment (same
                rules as the Files column). Formats overlap.
              </p>
            </div>
          </div>
        </div>

        {/* Missing cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <InsightCard
            label="Missing PDF"
            value={missing.missingPdf}
            sub="No PDF path on row"
            tone="rose"
            onClick={() => applyCapsuleAvailMiss("All", "pdf", "missing")}
          />
          <InsightCard
            label="Missing DOCX"
            value={missing.missingDocx}
            sub="No Word path on row"
            tone="amber"
            onClick={() => applyCapsuleAvailMiss("All", "docx", "missing")}
          />
          <InsightCard
            label="Single version slot"
            value={missing.singleVersionOnly}
            sub="No prior-version files stored"
            tone="violet"
          />
          <InsightCard
            label="No expiry date"
            value={missing.noExpiryDate}
            sub="Review date not set"
            tone="slate"
            onClick={() => applyChartExpiryFilter("nodate")}
          />
        </div>
      </Section>

      {/* Risk */}
      <Section
        icon={ShieldAlert}
        title="Risk & expiry"
        subtitle="Stacked compliance by department and upcoming renewal windows">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-md">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-600">
              Department compliance health
            </p>
            <div className="h-[300px]">
              {isEmpty ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  No data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stackedCompliance}
                    margin={{ top: 8, right: 16, left: 4, bottom: 48 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e5e7eb"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 9 }}
                      angle={-30}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 10 }} width={32} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                      formatter={(v: unknown, n: unknown) => [
                        tipN(v),
                        String(n),
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey="active"
                      stackId="a"
                      fill={RISK.active}
                      name="Active"
                      radius={[0, 0, 0, 0]}
                      onClick={(e: any) => {
                        const d = e?.payload?.fullDept as string | undefined;
                        if (d) applyCapsuleFilter(d, "all");
                      }}
                    />
                    <Bar
                      dataKey="nearExpiry"
                      stackId="a"
                      fill={RISK.near}
                      name="Near (≤30d)"
                      onClick={(e: any) => {
                        const d = e?.payload?.fullDept as string | undefined;
                        if (d) applyChartExpiryFilter("high", d);
                      }}
                    />
                    <Bar
                      dataKey="expired"
                      stackId="a"
                      fill={RISK.expired}
                      name="Expired"
                      radius={[6, 6, 0, 0]}
                      onClick={(e: any) => {
                        const d = e?.payload?.fullDept as string | undefined;
                        if (d) applyChartExpiryFilter("expired", d);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-md">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-600">
              Expiry timeline (next 90 days)
            </p>
            <p className="mb-2 text-[10px] text-gray-500">
              Rows with a future expiry; click a bar to filter
            </p>
            <div className="h-[300px]">
              {isEmpty ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  No data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={timeline}
                    margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                    <defs>
                      <linearGradient id={gradArea} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a78bfa" />
                        <stop offset="100%" stopColor="#5b21b6" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e5e7eb"
                      vertical={false}
                    />
                    <XAxis dataKey="window" tick={{ fontSize: 10 }} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      width={32}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                      formatter={(v: unknown) => [tipN(v), "SOPs expiring"]}
                    />
                    <Bar
                      dataKey="count"
                      fill={`url(#${gradArea})`}
                      radius={[8, 8, 0, 0]}
                      animationDuration={800}
                      onClick={(e: any) => {
                        const w = e?.payload?.window as string | undefined;
                        if (w?.includes("0–30")) applyChartExpiryFilter("high");
                        else if (w?.includes("31–60"))
                          applyChartExpiryFilter("medium");
                        else if (w?.includes("61–90"))
                          applyChartExpiryFilter("soon90");
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* Files & versions */}
      <Section
        icon={FolderOpen}
        title="File & version insights"
        subtitle="Version depth and bilingual coverage">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-md">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-600">
              Version slots
            </p>
            <p className="mb-2 text-[10px] text-gray-500">
              Current row + prior-version artifacts (English + Gujarati slots).
              Higher = more history on file.
            </p>
            <div className="h-[260px]">
              {isEmpty ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  No data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={versionBuckets}
                    margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e5e7eb"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 10 }} width={36} />
                    <Tooltip formatter={(v: unknown) => [tipN(v), "SOPs"]} />
                    <Bar
                      dataKey="value"
                      fill="#6366f1"
                      radius={[8, 8, 0, 0]}
                      animationDuration={800}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-md">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-600">
              Dual language by department
            </p>
            <div className="h-[260px]">
              {isEmpty ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  No data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dualDept}
                    margin={{ top: 8, right: 16, left: 4, bottom: 48 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e5e7eb"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 9 }}
                      angle={-30}
                      textAnchor="end"
                      height={64}
                    />
                    <YAxis tick={{ fontSize: 10 }} width={32} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    />
                    <Legend />
                    <Bar
                      dataKey="dual"
                      stackId="d"
                      fill="#7c3aed"
                      name="Dual"
                      radius={[0, 0, 0, 0]}
                      onClick={(e: any) => {
                        const d = e?.payload?.department as string | undefined;
                        if (d) applyCapsuleFilter(d, "dual");
                      }}
                    />
                    <Bar
                      dataKey="single"
                      stackId="d"
                      fill="#c4b5fd"
                      name="Single"
                      radius={[6, 6, 0, 0]}
                      onClick={(e: any) => {
                        const d = e?.payload?.department;
                        if (d) applyCapsuleFilter(d, "all");
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <p className="mt-1 text-[10px] text-gray-500">
              Click dual stack → dual-language filter for that department
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
