'use client';

import { useCallback, useState } from 'react';

export interface TrackedPipeline {
  sopId: string;
  sopIdentifier: string;
  sopName: string;
  language: 'English' | 'Gujarati';
  department?: string;
  startedAt: number;
}

export function usePipelineTracker() {
  const [tracked, setTracked] = useState<TrackedPipeline[]>([]);

  const trackUpload = useCallback((entry: Omit<TrackedPipeline, 'startedAt'>) => {
    setTracked((prev) => {
      if (prev.some((p) => p.sopId === entry.sopId)) return prev;
      return [...prev, { ...entry, startedAt: Date.now() }];
    });
  }, []);

  const trackMany = useCallback((entries: Array<Omit<TrackedPipeline, 'startedAt'>>) => {
    if (!entries.length) return;
    setTracked((prev) => {
      const seen = new Set(prev.map((p) => p.sopId));
      const fresh: TrackedPipeline[] = [];
      for (const e of entries) {
        if (seen.has(e.sopId)) continue;
        seen.add(e.sopId);
        fresh.push({ ...e, startedAt: Date.now() });
      }
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  const untrack = useCallback((sopId: string) => {
    setTracked((prev) => prev.filter((p) => p.sopId !== sopId));
  }, []);

  const clearAll = useCallback(() => setTracked([]), []);

  return { tracked, trackUpload, trackMany, untrack, clearAll };
}
