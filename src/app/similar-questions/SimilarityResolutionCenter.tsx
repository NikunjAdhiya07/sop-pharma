'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Zap, AlertCircle, CheckCircle2, Clock, FileText, Eye } from 'lucide-react';

type Phase = 'config' | 'preview' | 'running' | 'complete' | 'error';

interface SimilarityResolutionCenterProps {
  mcqBankId: string;
  sopId: string;
  sopName: string;
  sopIdentifier: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (summary: { found: number; replaced: number; kept: number; failed: number }) => void;
}

interface ClusterResult {
  similarQuestionDocId: string;
  primaryQuestionIndex: number;
  clusterSize: number;
  maxScore: number;
  bestKeptIndex: number;
  questionsToReplace: number;
  status: 'skipped' | 'dry_run' | 'replaced' | 'failed' | 'below_threshold';
  replacedQuestions?: number[];
  failureReason?: string;
  eligibleScores: Array<{ questionIndex: number; score: number; question: string }>;
}

interface BulkResolveResponse {
  success: boolean;
  dryRun: boolean;
  summary: {
    found: number;
    eligible: number;
    replaced: number;
    kept: number;
    failed: number;
    eliminatedCount: number;
  };
  clusters: ClusterResult[];
  log: string[];
  error?: string;
}

const MODE_DESCRIPTIONS = {
  conservative: 'Replace only Exact Duplicates (≥90% similarity)',
  balanced: 'Replace Exact Duplicates and Strong Similarities (≥80%)',
  aggressive: 'Replace all similar questions (≥70% similarity)',
};

const SIMILARITY_LEVELS = {
  exact: { label: 'Exact Duplicate', color: 'bg-red-500/20 text-red-300', threshold: 90 },
  strong: { label: 'Strong Similarity', color: 'bg-orange-500/20 text-orange-300', threshold: 80 },
  weak: { label: 'Weak Similarity', color: 'bg-yellow-500/20 text-yellow-300', threshold: 70 },
  below: { label: 'Below Threshold', color: 'bg-gray-500/20 text-gray-400', threshold: 0 },
};

function getSimilarityLevel(score: number) {
  if (score >= 90) return 'exact';
  if (score >= 80) return 'strong';
  if (score >= 70) return 'weak';
  return 'below';
}

export default function SimilarityResolutionCenter({
  mcqBankId,
  sopId,
  sopName,
  sopIdentifier,
  isOpen,
  onClose,
  onComplete,
}: SimilarityResolutionCenterProps) {
  const [phase, setPhase] = useState<Phase>('config');
  const [mode, setMode] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');
  const [dryRunResult, setDryRunResult] = useState<BulkResolveResponse | null>(null);
  const [finalResult, setFinalResult] = useState<BulkResolveResponse | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReplacedView, setShowReplacedView] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logLines]);

  // Elapsed time counter
  useEffect(() => {
    if (phase !== 'running') return;

    const interval = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  // Fake progress ticker
  useEffect(() => {
    if (phase !== 'running') return;

    const fakeSteps = [
      { delay: 500, text: '⟳ Connecting to detection engine...' },
      { delay: 2000, text: '⟳ Running similarity scan across all questions...' },
      { delay: 4500, text: '⟳ Analyzing and scoring cluster candidates...' },
      { delay: 7000, text: '⟳ Initiating AI generation phase for replacements...' },
    ];

    const timers = fakeSteps.map(step =>
      setTimeout(() => {
        setLogLines(prev => [...prev, step.text]);
      }, step.delay)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [phase]);

  const runDryRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/mcq-bank/bulk-resolve-similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcqBankId,
          mode,
          dryRun: true,
        }),
      });

      const data: BulkResolveResponse = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to run dry-run');
        setPhase('error');
        return;
      }

      setDryRunResult(data);
      setPhase('preview');
    } catch (err: any) {
      setError(err.message || 'Network error during dry-run');
      setPhase('error');
    } finally {
      setLoading(false);
    }
  };

  const runActual = async () => {
    setLoading(true);
    setError(null);
    setPhase('running');
    setLogLines([]);
    setElapsedSeconds(0);

    try {
      const response = await fetch('/api/mcq-bank/bulk-resolve-similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcqBankId,
          mode,
          dryRun: false,
        }),
      });

      const data: BulkResolveResponse = await response.json();

      // Replace fake log with real log
      setLogLines(data.log || []);
      setFinalResult(data);

      if (!data.success) {
        setError(data.error || 'Resolution failed');
        setPhase('error');
      } else {
        setPhase('complete');
      }
    } catch (err: any) {
      setError(err.message || 'Network error during resolution');
      setPhase('error');
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    if (finalResult) {
      onComplete({
        found: finalResult.summary.found,
        replaced: finalResult.summary.replaced,
        kept: finalResult.summary.kept,
        failed: finalResult.summary.failed,
      });
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-white font-bold text-lg">Similarity Resolution Center</h2>
              <p className="text-purple-100 text-xs">
                {sopName} ({sopIdentifier})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-white/80 hover:text-white disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {phase === 'config' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-white font-semibold mb-4">Select Resolution Mode</h3>
                <div className="space-y-3">
                  {(['conservative', 'balanced', 'aggressive'] as const).map(m => (
                    <label key={m} className="flex items-start gap-3 p-3 border border-gray-600 rounded-lg hover:bg-gray-800/50 cursor-pointer">
                      <input
                        type="radio"
                        name="mode"
                        value={m}
                        checked={mode === m}
                        onChange={() => setMode(m)}
                        className="mt-1"
                      />
                      <div>
                        <div className="text-white font-medium capitalize">{m}</div>
                        <div className="text-gray-400 text-sm">{MODE_DESCRIPTIONS[m]}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex gap-3 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-200 text-sm">{error}</p>
                </div>
              )}
            </div>
          )}

          {phase === 'preview' && dryRunResult && (
            <div className="space-y-6">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex gap-2 items-start">
                  <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white font-semibold text-sm">Preview Results</p>
                    <p className="text-gray-300 text-sm mt-1">
                      {dryRunResult.summary.found} clusters found • {dryRunResult.summary.eligible} eligible for replacement
                    </p>
                  </div>
                </div>
              </div>

              {dryRunResult.clusters.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-600">
                        <th className="text-left py-2 px-3 text-gray-300 font-semibold">Q#</th>
                        <th className="text-left py-2 px-3 text-gray-300 font-semibold">Score</th>
                        <th className="text-left py-2 px-3 text-gray-300 font-semibold">Level</th>
                        <th className="text-left py-2 px-3 text-gray-300 font-semibold">Keep</th>
                        <th className="text-left py-2 px-3 text-gray-300 font-semibold">Replace</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dryRunResult.clusters.map((cluster, idx) => {
                        const best = cluster.eligibleScores.find(s => s.questionIndex === cluster.bestKeptIndex);
                        const level = getSimilarityLevel(best?.score || 0);
                        const levelInfo = SIMILARITY_LEVELS[level as keyof typeof SIMILARITY_LEVELS];

                        return (
                          <tr key={idx} className="border-b border-gray-700 hover:bg-gray-800/50">
                            <td className="py-3 px-3 text-white">
                              Q{cluster.bestKeptIndex + 1}
                            </td>
                            <td className="py-3 px-3 text-gray-300">{Math.round(best?.score || 0)}%</td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${levelInfo.color}`}>
                                {levelInfo.label}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-blue-300">Q{cluster.bestKeptIndex + 1}</span>
                            </td>
                            <td className="py-3 px-3 text-orange-300">
                              {cluster.questionsToReplace > 0 ? `${cluster.questionsToReplace}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-400">No similar questions found in this bank</p>
                </div>
              )}

              {dryRunResult.summary.eligible > 0 && (
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-600">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Will replace</p>
                      <p className="text-white font-semibold text-lg">{dryRunResult.summary.eligible}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Will keep</p>
                      <p className="text-white font-semibold text-lg">{dryRunResult.summary.found - dryRunResult.summary.eligible}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === 'running' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">Running Resolution...</h3>
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Clock className="w-4 h-4" />
                  <span>{elapsedSeconds}s</span>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                {logLines.map((line, idx) => (
                  <div key={idx} className="text-gray-300 text-sm font-mono whitespace-pre-wrap break-words">
                    {line}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>

              {dryRunResult && (
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min((elapsedSeconds / 60) * 100, 90)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {phase === 'complete' && finalResult && (
            <div className="space-y-6">
              {!showReplacedView ? (
                <>
                  {/* Rich Success Summary Banner */}
                  <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/10 border border-green-500/50 rounded-lg p-5">
                    <div className="flex items-start gap-4">
                      <CheckCircle2 className="w-8 h-8 text-green-400 flex-shrink-0 mt-1" />
                      <div className="flex-1">
                        <p className="text-white font-bold text-lg mb-3">Similarity Resolution Complete ✓</p>
                        <ul className="space-y-2 text-green-100/90 text-sm">
                          <li className="flex items-center gap-2">
                            <span className="text-green-400">✓</span>
                            <span>Found {finalResult.summary.found} similar question(s)</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="text-green-400">✓</span>
                            <span>Replaced {finalResult.summary.replaced} duplicate/similar question(s)</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="text-green-400">✓</span>
                            <span>Kept {finalResult.summary.kept} original question(s) as primary versions</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="text-green-400">✓</span>
                            <span>All replacements inserted in original positions</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="text-green-400">✓</span>
                            <span>Similarity check completed successfully</span>
                          </li>
                          {finalResult.summary.failed > 0 && (
                            <li className="flex items-center gap-2 mt-3 pt-2 border-t border-green-500/30">
                              <span className="text-orange-400">⚠️</span>
                              <span>{finalResult.summary.failed} replacement(s) failed and were kept as original</span>
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-600 hover:border-green-500/30 transition-colors">
                      <p className="text-gray-400 text-sm">Found</p>
                      <p className="text-white font-bold text-2xl mt-1">{finalResult.summary.found}</p>
                      <p className="text-gray-500 text-xs mt-1">similar groups</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-600 hover:border-green-500/30 transition-colors">
                      <p className="text-gray-400 text-sm">Replaced</p>
                      <p className="text-white font-bold text-2xl mt-1">{finalResult.summary.replaced}</p>
                      <p className="text-gray-500 text-xs mt-1">questions</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-600 hover:border-green-500/30 transition-colors">
                      <p className="text-gray-400 text-sm">Kept</p>
                      <p className="text-white font-bold text-2xl mt-1">{finalResult.summary.kept}</p>
                      <p className="text-gray-500 text-xs mt-1">clusters</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-600 hover:border-orange-500/30 transition-colors">
                      <p className="text-gray-400 text-sm">Failed</p>
                      <p className="text-white font-bold text-2xl mt-1">{finalResult.summary.failed}</p>
                      <p className="text-gray-500 text-xs mt-1">replacements</p>
                    </div>
                  </div>

                  {/* Replacement Log - Always Visible */}
                  {finalResult.log.length > 0 && (
                    <div className="bg-gray-800/50 rounded-lg border border-gray-600 p-4">
                      <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Replacement Log ({finalResult.log.length} entries)
                      </h4>
                      <div className="max-h-48 overflow-y-auto space-y-1 text-xs text-gray-400 font-mono bg-gray-900/50 rounded p-3">
                        {finalResult.log.map((line, idx) => (
                          <div key={idx} className="hover:text-gray-300 transition-colors">{line}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Replaced Questions View */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-white font-semibold flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      Replaced Questions Detail
                    </h4>
                    <p className="text-gray-400 text-xs">{finalResult.clusters.filter(c => c.replacedQuestions && c.replacedQuestions.length > 0).length} cluster(s)</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-600">
                          <th className="text-left py-2 px-3 text-gray-300 font-semibold">Position</th>
                          <th className="text-left py-2 px-3 text-gray-300 font-semibold">Old Question (Preview)</th>
                          <th className="text-left py-2 px-3 text-gray-300 font-semibold">Status</th>
                          <th className="text-left py-2 px-3 text-gray-300 font-semibold">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finalResult.clusters.map((cluster, idx) => {
                          if (!cluster.replacedQuestions || cluster.replacedQuestions.length === 0) return null;

                          return cluster.replacedQuestions.map((replacedIdx, ridx) => {
                            const oldQuestion = cluster.eligibleScores.find(s => s.questionIndex === replacedIdx);
                            return (
                              <tr key={`${idx}-${ridx}`} className="border-b border-gray-700 hover:bg-gray-800/50">
                                <td className="py-3 px-3 text-white font-medium">Q{replacedIdx + 1}</td>
                                <td className="py-3 px-3 text-gray-300 text-xs">{oldQuestion?.question || '—'}</td>
                                <td className="py-3 px-3">
                                  <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-300">
                                    Replaced
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-orange-300">Q{cluster.bestKeptIndex + 1}</td>
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-4">
              <div className="flex gap-3 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
                <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-200 font-semibold">Resolution Failed</p>
                  <p className="text-red-100/80 text-sm mt-1">{error || 'An unexpected error occurred'}</p>
                </div>
              </div>

              {logLines.length > 0 && (
                <div className="bg-gray-800/50 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <p className="text-gray-400 text-xs font-semibold mb-2">Last Log Entries:</p>
                  <div className="space-y-1 text-xs text-gray-400 font-mono">
                    {logLines.slice(-10).map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-800 border-t border-gray-700 px-6 py-4 flex gap-3 justify-end">
          {phase === 'config' && (
            <>
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-gray-300 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={runDryRun}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                {loading ? 'Loading...' : 'Run Dry-Run Preview'}
              </button>
            </>
          )}

          {phase === 'preview' && dryRunResult && (
            <>
              <button
                onClick={() => setPhase('config')}
                disabled={loading}
                className="px-4 py-2 text-gray-300 hover:text-white disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-gray-300 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={runActual}
                disabled={loading || dryRunResult.summary.eligible === 0}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                {loading ? 'Starting...' : 'Approve & Run'}
              </button>
            </>
          )}

          {phase === 'running' && (
            <button
              disabled
              className="px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold opacity-50 cursor-not-allowed"
            >
              Running...
            </button>
          )}

          {phase === 'complete' && (
            <>
              {!showReplacedView && finalResult && finalResult.clusters.some(c => c.replacedQuestions && c.replacedQuestions.length > 0) && (
                <button
                  onClick={() => setShowReplacedView(true)}
                  className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg font-semibold transition-colors flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  View Replaced Questions
                </button>
              )}
              {showReplacedView && (
                <button
                  onClick={() => setShowReplacedView(false)}
                  className="px-4 py-2 text-gray-300 hover:text-white"
                >
                  Back to Summary
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-300 hover:text-white"
              >
                Stay Open
              </button>
              <button
                onClick={handleDone}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-semibold transition-colors"
              >
                Done
              </button>
            </>
          )}

          {phase === 'error' && (
            <>
              <button
                onClick={() => setPhase('config')}
                className="px-4 py-2 text-gray-300 hover:text-white"
              >
                Back
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
