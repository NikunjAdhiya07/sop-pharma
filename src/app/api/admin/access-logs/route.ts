import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getUserAccessLogs, getResourceAccessLogs, getAccessStats, getRecentAccessLogs } from '@/lib/accessLogger';

export async function GET(request: NextRequest) {
  try {
    const session: any = await getServerSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins and QA heads can view access logs
    if (session.user.role !== 'admin' && session.user.role !== 'qa-head') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'user', 'resource', 'stats', 'recent'
    const userId = searchParams.get('userId');
    const resourceType = searchParams.get('resourceType');
    const resourceId = searchParams.get('resourceId');
    const limit = parseInt(searchParams.get('limit') || '100');
    const days = parseInt(searchParams.get('days') || '30');

    // Get logs for a specific user
    if (type === 'user' && userId) {
      const logs = await getUserAccessLogs(userId, limit);
      return NextResponse.json({ success: true, logs });
    }

    // Get logs for a specific resource
    if (type === 'resource' && resourceType && resourceId) {
      const logs = await getResourceAccessLogs(resourceType, resourceId, limit);
      return NextResponse.json({ success: true, logs });
    }

    // Get access statistics
    if (type === 'stats') {
      const stats = await getAccessStats(days);
      return NextResponse.json({ success: true, stats });
    }

    // Get recent access logs (default)
    const logs = await getRecentAccessLogs(limit);
    return NextResponse.json({ success: true, logs });

  } catch (error) {
    console.error('Error fetching access logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch access logs' },
      { status: 500 }
    );
  }
}
