import { NextRequest } from 'next/server';
import { getDashboardSopsCache } from '@/lib/dashboardSopsCache';
import { GET as getDashboardSops } from '@/app/api/dashboard/sops/route';

type DashboardPayload = {
  success: boolean;
  data?: any[];
  metadata?: any;
};

/**
 * Returns the Dashboard SOP registry payload (same data used by Dashboard page).
 *
 * Strategy:
 * - Prefer warm in-memory cache (fast).
 * - If cache is missing/stale, compute by invoking the dashboard route handler directly.
 */
export async function getDashboardRegistryPayload(originUrl: string): Promise<DashboardPayload> {
  const cached = getDashboardSopsCache();
  if (cached && cached.payload) return cached.payload as DashboardPayload;

  // Compute on-demand (nocache ensures the route doesn't return an empty cache entry)
  const url = new URL('/api/dashboard/sops?nocache=1', originUrl);
  const req = new NextRequest(url);
  const res = await getDashboardSops(req as any);
  const json = (await res.json()) as DashboardPayload;
  return json;
}

