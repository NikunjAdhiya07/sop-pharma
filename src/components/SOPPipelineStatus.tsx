"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, Circle, Loader2, XCircle, ChevronDown, ChevronUp } from "lucide-react";

type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface StageDetail {
  status: StageStatus;
  progress: number;
  detail?: string;
  errorMessage?: string;
}

interface PipelineStatusResponse {
  pipelineStatus: string;
  overallProgress: number;
  stages: {
    mcqGeneration: StageDetail;
    similarityCheck: StageDetail;
    complianceFix: StageDetail;
    platformUpdate: StageDetail;
  };
  complianceScore: number | null;
  unresolvedFindings: number;
  similarityIterations: number;
  errorStage: string | null;
  errorMessage: string | null;
  estimatedMinutesRemaining: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface SOPPipelineStatusProps {
  sopId: string;
  sopName?: string;
  onComplete?: () => void;
  onError?: (msg: string) => void;
  compact?: boolean;
}

const PIPELINE_STAGES = [
  { key: "uploaded", label: "Uploaded", stageKey: null },
  { key: "mcqGeneration", label: "MCQ Gen", stageKey: "mcqGeneration" },
  { key: "similarityCheck", label: "Similarity", stageKey: "similarityCheck" },
  { key: "complianceFix", label: "Compliance", stageKey: "complianceFix" },
  { key: "platformUpdate", label: "Approved", stageKey: "platformUpdate" },
] as const;

function StageIcon({ status }: { status: StageStatus | "done" }) {
  if (status === "completed" || status === "done")
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
  if (status === "running")
    return <Loader2 className="h-3.5 w-3.5 text-indigo-500 animate-spin shrink-0" />;
  if (status === "failed")
    return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  return <Circle className="h-3.5 w-3.5 text-gray-300 shrink-0" />;
}

function getStageStatus(
  stageKey: string | null,
  stages: PipelineStatusResponse["stages"],
  pipelineStatus: string
): StageStatus | "done" {
  if (stageKey === null) return "done"; // "Uploaded" is always done if pipeline exists
  const stage = stages[stageKey as keyof typeof stages];
  if (!stage) return "pending";
  return stage.status;
}

export default function SOPPipelineStatus({
  sopId,
  sopName,
  onComplete,
  onError,
  compact = false,
}: SOPPipelineStatusProps) {
  const [data, setData] = useState<PipelineStatusResponse | null>(null);
  const [expanded, setExpanded] = useState(!compact);
  const [stopped, setStopped] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/sop/pipeline/status/${sopId}`);
      if (!res.ok) return;
      const json: PipelineStatusResponse = await res.json();
      setData(json);

      if (json.pipelineStatus === "approved") {
        setStopped(true);
        onComplete?.();
      } else if (json.pipelineStatus === "failed") {
        setStopped(true);
        onError?.(json.errorMessage || "Pipeline failed");
      }
    } catch {
      // silently retry
    }
  }, [sopId, onComplete, onError]);

  useEffect(() => {
    fetchStatus();
    if (stopped) return;
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus, stopped]);

  if (!data || data.pipelineStatus === "idle") return null;

  const isApproved = data.pipelineStatus === "approved";
  const isFailed = data.pipelineStatus === "failed";

  if (compact && isApproved) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Pipeline Complete
      </span>
    );
  }

  if (compact && isFailed) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 border border-red-200 cursor-pointer"
        title={data.errorMessage || "Pipeline failed"}
      >
        <XCircle className="h-3 w-3" /> Pipeline Failed
      </span>
    );
  }

  const currentStageDetail = (() => {
    const s = data.stages;
    if (s.platformUpdate.status === "running") return s.platformUpdate.detail;
    if (s.complianceFix.status === "running") return s.complianceFix.detail;
    if (s.similarityCheck.status === "running") return s.similarityCheck.detail;
    if (s.mcqGeneration.status === "running") return s.mcqGeneration.detail;
    return null;
  })();

  return (
    <div className="mt-1 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs shadow-sm">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {PIPELINE_STAGES.map((stage, i) => {
            const status = getStageStatus(stage.stageKey, data.stages, data.pipelineStatus);
            const isActive =
              stage.stageKey &&
              data.stages[stage.stageKey as keyof typeof data.stages]?.status === "running";
            return (
              <span
                key={stage.key}
                className={`inline-flex items-center gap-1 font-medium ${
                  isActive
                    ? "text-indigo-700"
                    : status === "completed" || status === "done"
                    ? "text-emerald-700"
                    : status === "failed"
                    ? "text-red-600"
                    : "text-gray-400"
                }`}
              >
                <StageIcon status={status} />
                <span className="text-[10px]">{stage.label}</span>
                {i < PIPELINE_STAGES.length - 1 && (
                  <span className="text-gray-300 ml-0.5">›</span>
                )}
              </span>
            );
          })}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          className="text-indigo-400 hover:text-indigo-600 shrink-0"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-1.5 h-1.5 rounded-full bg-indigo-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isFailed ? "bg-red-400" : isApproved ? "bg-emerald-500" : "bg-indigo-500"
          }`}
          style={{ width: `${data.overallProgress}%` }}
        />
      </div>

      {/* Progress label */}
      <div className="mt-0.5 flex items-center justify-between text-[9px] text-indigo-500">
        <span>{data.overallProgress}%</span>
        {data.estimatedMinutesRemaining != null && !isApproved && !isFailed && (
          <span>~{data.estimatedMinutesRemaining} min remaining</span>
        )}
        {isApproved && <span className="text-emerald-600 font-semibold">Complete</span>}
        {isFailed && <span className="text-red-600 font-semibold">Failed</span>}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-2 space-y-1 border-t border-indigo-200/60 pt-2">
          {currentStageDetail && (
            <p className="text-[10px] text-indigo-700 font-medium">{currentStageDetail}</p>
          )}

          {isFailed && data.errorMessage && (
            <p className="text-[10px] text-red-600 break-words">
              Error ({data.errorStage}): {data.errorMessage}
            </p>
          )}

          {isApproved && (
            <div className="flex flex-wrap gap-2 text-[10px]">
              {data.complianceScore != null && (
                <span className="text-emerald-700">
                  Compliance: {data.complianceScore.toFixed(1)}/10
                </span>
              )}
              {data.unresolvedFindings > 0 && (
                <span className="text-amber-600">
                  {data.unresolvedFindings} findings need review
                </span>
              )}
              {data.similarityIterations > 0 && (
                <span className="text-gray-500">
                  {data.similarityIterations} similarity iteration(s)
                </span>
              )}
            </div>
          )}

          {/* Stage-by-stage summary */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px] text-gray-500 mt-1">
            {(["mcqGeneration", "similarityCheck", "complianceFix", "platformUpdate"] as const).map(k => {
              const s = data.stages[k];
              const labels: Record<string, string> = {
                mcqGeneration: "MCQ Generation",
                similarityCheck: "Similarity Check",
                complianceFix: "Compliance Fix",
                platformUpdate: "Platform Update",
              };
              return (
                <div key={k} className="flex items-center gap-1">
                  <StageIcon status={s.status} />
                  <span>{labels[k]}</span>
                  {s.status === "running" && <span className="text-indigo-400">{s.progress}%</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
