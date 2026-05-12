import { NextResponse } from 'next/server';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dashboard/invalidate-cache
 *
 * Clears the server-side in-memory cache for the dashboard SOP registry.
 * Must be called by any upload or mutation that changes SOP data so that
 * the next GET /api/dashboard/sops re-fetches fresh data from MongoDB.
 */
export async function POST() {
  await invalidateDashboardSopsCache();
  return NextResponse.json({ success: true, message: 'Dashboard cache invalidated' });
}
