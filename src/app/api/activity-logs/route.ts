import { NextRequest, NextResponse } from 'next/server';
import {
  logSOPActivity,
  getSOPActivityTimeline,
  getUserActivityHistory,
  getActivitiesByDateRange,
  getActivityStatistics,
  getRecentActivities,
} from '@/lib/activityLogger';

/**
 * GET - Fetch activity logs with various filters
 * Query params:
 * - type: 'sop' | 'user' | 'dateRange' | 'recent' | 'statistics'
 * - sopId: SOP ID (for type=sop)
 * - userId: User ID (for type=user)
 * - startDate: Start date (for type=dateRange)
 * - endDate: End date (for type=dateRange)
 * - hours: Hours to look back (for type=recent, default 24)
 * - actionType: Filter by action type
 * - department: Filter by department
 * - limit: Number of results (default 50)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'recent';
    
    switch (type) {
      case 'sop': {
        const sopId = searchParams.get('sopId');
        const limit = parseInt(searchParams.get('limit') || '50');
        
        if (!sopId) {
          return NextResponse.json(
            { error: 'sopId is required for type=sop' },
            { status: 400 }
          );
        }
        
        const result = await getSOPActivityTimeline(sopId, limit);
        return NextResponse.json(result);
      }
      
      case 'user': {
        const userId = searchParams.get('userId');
        const limit = parseInt(searchParams.get('limit') || '100');
        
        if (!userId) {
          return NextResponse.json(
            { error: 'userId is required for type=user' },
            { status: 400 }
          );
        }
        
        const result = await getUserActivityHistory(userId, limit);
        return NextResponse.json(result);
      }
      
      case 'dateRange': {
        const startDateStr = searchParams.get('startDate');
        const endDateStr = searchParams.get('endDate');
        
        if (!startDateStr || !endDateStr) {
          return NextResponse.json(
            { error: 'startDate and endDate are required for type=dateRange' },
            { status: 400 }
          );
        }
        
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        
        const filters = {
          actionType: searchParams.get('actionType') || undefined,
          userId: searchParams.get('userId') || undefined,
          department: searchParams.get('department') || undefined,
          sopId: searchParams.get('sopId') || undefined,
        };
        
        const result = await getActivitiesByDateRange(startDate, endDate, filters);
        return NextResponse.json(result);
      }
      
      case 'recent': {
        const hours = parseInt(searchParams.get('hours') || '24');
        const limit = parseInt(searchParams.get('limit') || '50');
        
        const result = await getRecentActivities(hours, limit);
        return NextResponse.json(result);
      }
      
      case 'statistics': {
        const startDateStr = searchParams.get('startDate');
        const endDateStr = searchParams.get('endDate');
        const department = searchParams.get('department');
        
        const filters: any = {};
        if (startDateStr) filters.startDate = new Date(startDateStr);
        if (endDateStr) filters.endDate = new Date(endDateStr);
        if (department) filters.department = department;
        
        const result = await getActivityStatistics(filters);
        return NextResponse.json(result);
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid type parameter' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Error in activity logs API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity logs', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST - Log a new activity
 * Body: LogActivityParams
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate required fields
    const requiredFields = [
      'sopId', 'sopIdentifier', 'sopName',
      'userId', 'userName', 'userRole',
      'actionType', 'actionCategory'
    ];
    
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }
    
    // Extract IP and User Agent from request headers
    const ipAddress = req.headers.get('x-forwarded-for') || 
                      req.headers.get('x-real-ip') || 
                      'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    
    const result = await logSOPActivity({
      ...body,
      ipAddress,
      userAgent,
    });
    
    if (result.success) {
      return NextResponse.json(result, { status: 201 });
    } else {
      return NextResponse.json(
        { error: 'Failed to log activity', details: result.error },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error logging activity:', error);
    return NextResponse.json(
      { error: 'Failed to log activity', details: error.message },
      { status: 500 }
    );
  }
}
