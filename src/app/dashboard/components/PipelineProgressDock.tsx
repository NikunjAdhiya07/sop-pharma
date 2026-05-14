'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, CheckCircle2, AlertCircle, Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import type { TrackedPipeline } from '../hooks/usePipelineTracker';

type StageStatus = 'pending' | 'running' | 'completed' | 'failed';

interface StageState {
  status: StageStatus;
  progress: number;
}

interface PipelineStatusResponse {
  pipelineStatus:
    | 'idle'
    | 'mcq_generating'
    | 'similarity_checking'
    | 'compliance_fixing'
    | 'platform_update'
    | 'approved'
    | 'failed';
  overallProgress: number;
  stages: {
    mcqGeneration: StageState;
    similarityCheck: StageState;
    complianceFix: StageState;
    platformUpdate: StageState;
  };
  similarityIterations: number;
  errorStage?: string | null;
  errorMessage?: string | null;
  estimatedMinutesRemaining: number | null;
}

interface PipelineProgressDockProps {
  tracked: TrackedPipeline[];
  onComplete: (sopId: string) => void;
  onDismiss: (sopId: string) => void;
  /** Called once when a tracked EN SOP's GU sibling is discovered, so parent can add it to tracking. */
  onSiblingFound: (entry: Omit<TrackedPipeline, 'startedAt'>) => void;
}

const POLL_INTERVAL_MS = 3000;
const SIBLING_LOOKUP_DELAY_MS = 6000;
const AUTO_DISMISS_AFTER_COMPLETE_MS = 15000;

function PipelineRow({
  entry,
  onComplete,
  onDismiss,
  onSiblingFound,
  knownSopIds,
}: {
  entry: TrackedPipeline;
  onComplete: (sopId: string) => void;
  onDismiss: (sopId: string) => void;
  onSiblingFound: (entry: Omit<TrackedPipeline, 'startedAt'>) => void;
  knownSopIds: Set<string>;
}) {
  const [status, setStatus] = useState<PipelineStatusResponse | null>(null);
  const [terminalNotified, setTerminalNotified] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const siblingFetchedRef = useRef(false);

  // Sibling discovery: when an English SOP is uploaded, the upload route auto-triggers a paired
  // Gujarati pipeline. After a short delay, look up siblings by identifier and surface the GU one.
  useEffect(() => {
    if (siblingFetchedRef.current) return;
    const t = setTimeout(async () => {
      siblingFetchedRef.current = true;
      try {
        const res = await fetch(
          `/api/sop/pipeline/siblings?identifier=${encodeURIComponent(entry.sopIdentifier)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          siblings: Array<{
            sopId: string;
            sopIdentifier: string;
            sopName: string;
            department: string;
            language: 'English' | 'Gujarati';
          }>;
        };
        for (const sib of data.siblings || []) {
          if (sib.sopId === entry.sopId) continue;
          if (knownSopIds.has(sib.sopId)) continue;
          onSiblingFound({
            sopId: sib.sopId,
            sopIdentifier: sib.sopIdentifier,
            sopName: sib.sopName,
            department: sib.department,
            language: sib.language,
          });
        }
      } catch {
        /* ignore */
      }
    }, SIBLING_LOOKUP_DELAY_MS);
    return () => clearTimeout(t);
    // entry.sopId/identifier are stable per row mount; intentionally omit knownSopIds to keep this single-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.sopId, entry.sopIdentifier]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/sop/pipeline/status/${entry.sopId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PipelineStatusResponse = await res.json();
        if (cancelled) return;
        setStatus(data);

        const isTerminal = data.pipelineStatus === 'approved' || data.pipelineStatus === 'failed';
        if (isTerminal) {
          if (!terminalNotified) {
            setTerminalNotified(true);
            onComplete(entry.sopId);
          }
          if (!autoDismissRef.current) {
            autoDismissRef.current = setTimeout(
              () => onDismiss(entry.sopId),
              AUTO_DISMISS_AFTER_COMPLETE_MS
            );
          }
          return;
        }
      } catch {
        /* swallow — keep polling */
      }
      if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, [entry.sopId, onComplete, onDismiss, terminalNotified]);

  const buildLog = useCallback((): string[] => {
    const log: string[] = ['✓ SOP uploaded successfully', '✓ SOP indexed in database'];
    if (!status) {
      log.push('⏳ Triggering MCQ generation pipeline…');
      return log;
    }
    const { stages, similarityIterations, pipelineStatus, errorMessage, errorStage } = status;

    if (stages.mcqGeneration.status === 'running') {
      log.push(`⏳ Generating MCQs… (${stages.mcqGeneration.progress}%)`);
    } else if (
      stages.mcqGeneration.status === 'completed' ||
      stages.mcqGeneration.status === 'failed'
    ) {
      log.push(
        stages.mcqGeneration.status === 'completed'
          ? '✓ MCQ generation completed'
          : '✗ MCQ generation failed'
      );
    }

    if (stages.similarityCheck.status === 'running') {
      log.push(
        `⏳ Running similarity check${
          similarityIterations > 0 ? ` (iteration ${similarityIterations})` : ''
        }… (${stages.similarityCheck.progress}%)`
      );
    } else if (stages.similarityCheck.status === 'completed') {
      log.push('✓ Duplicate verification completed');
    } else if (stages.similarityCheck.status === 'failed') {
      log.push('✗ Similarity check failed');
    }

    if (stages.complianceFix.status === 'running') {
      log.push(`⏳ Compliance check… (${stages.complianceFix.progress}%)`);
    } else if (stages.complianceFix.status === 'completed') {
      log.push('✓ Compliance check completed');
    } else if (stages.complianceFix.status === 'failed') {
      log.push('✗ Compliance check failed');
    }

    if (stages.platformUpdate.status === 'running') {
      log.push('⏳ Updating dashboard statistics…');
    } else if (stages.platformUpdate.status === 'completed') {
      log.push('✓ Dashboard statistics updated');
    }

    if (pipelineStatus === 'approved') {
      log.push('✓ Process completed');
    } else if (pipelineStatus === 'failed') {
      log.push(`✗ Pipeline failed${errorStage ? ` at ${errorStage}` : ''}: ${errorMessage || 'unknown error'}`);
    }

    return log;
  }, [status]);

  const overall = status?.overallProgress ?? 0;
  const isApproved = status?.pipelineStatus === 'approved';
  const isFailed = status?.pipelineStatus === 'failed';
  const isRunning = !isApproved && !isFailed;
  const eta = status?.estimatedMinutesRemaining ?? null;
  const log = buildLog();

  const headerIcon = isApproved ? (
    <CheckCircle2 className="h-4 w-4 text-green-600" />
  ) : isFailed ? (
    <AlertCircle className="h-4 w-4 text-red-600" />
  ) : (
    <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
  );

  const barColor = isApproved ? 'bg-green-500' : isFailed ? 'bg-red-500' : 'bg-purple-500';
  const langBadge =
    entry.language === 'Gujarati' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {headerIcon}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[11px] font-semibold text-gray-800 truncate">
                {entry.sopIdentifier}
              </span>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${langBadge}`}
              >
                {entry.language === 'Gujarati' ? 'GUJ' : 'ENG'}
              </span>
            </div>
            <span className="text-[11px] text-gray-600 truncate" title={entry.sopName}>
              {entry.sopName}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(entry.sopId)}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] text-gray-600 mb-1">
          <span>
            {isApproved
              ? 'Completed'
              : isFailed
                ? 'Failed'
                : status
                  ? `${status.pipelineStatus.replace(/_/g, ' ')}`
                  : 'Starting…'}
          </span>
          <span className="font-semibold text-gray-700">
            {overall}%{isRunning && eta != null ? ` · ~${eta}m left` : ''}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
          <div
            className={`${barColor} h-full rounded-full transition-all duration-300`}
            style={{ width: `${overall}%` }}
          />
        </div>
      </div>

      {!collapsed && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-gray-700 max-h-32 overflow-y-auto">
          {log.map((line, i) => (
            <li key={i} className="leading-snug">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PipelineProgressDock({
  tracked,
  onComplete,
  onDismiss,
  onSiblingFound,
}: PipelineProgressDockProps) {
  const [minimized, setMinimized] = useState(false);
  if (tracked.length === 0) return null;

  const knownSopIds = new Set(tracked.map((t) => t.sopId));

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)]">
      <div className="rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-bold text-gray-800">
              MCQ Pipeline ({tracked.length})
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMinimized((m) => !m)}
            className="p-1 rounded hover:bg-white/60 text-gray-600"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
        {!minimized && (
          <div className="max-h-[60vh] overflow-y-auto p-2 space-y-2">
            {tracked.map((entry) => (
              <PipelineRow
                key={entry.sopId}
                entry={entry}
                onComplete={onComplete}
                onDismiss={onDismiss}
                onSiblingFound={onSiblingFound}
                knownSopIds={knownSopIds}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
