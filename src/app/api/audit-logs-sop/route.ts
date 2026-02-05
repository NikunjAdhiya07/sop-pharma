import { NextRequest, NextResponse } from 'next/server';
import { logAudit, getAuditLogs, getAuditLogById, getAuditStatistics } from '@/lib/sopAuditLogger';

/**
 * GET - Fetch audit logs with filters
 * Query params:
 * - type: 'list' | 'single' | 'statistics'
 * - logId: Log ID (for type=single)
 * - startDate: Start date (ISO format)
 * - endDate: End date (ISO format)
 * - userId: Filter by user
 * - department: Filter by department
 * - sopId: Filter by SOP
 * - sopIdentifier: Filter by SOP identifier
 * - actionType: Filter by action type
 * - module: Filter by module
 * - searchText: Search in description
 * - limit: Number of results (default 50)
 * - page: Page number (default 1)
 * - sortBy: Field to sort by (default 'timestamp')
 * - sortOrder: 'asc' | 'desc' (default 'desc')
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'list';
    
    switch (type) {
      case 'single': {
        const logId = searchParams.get('logId');
        
        if (!logId) {
          return NextResponse.json(
            { error: 'logId is required for type=single' },
            { status: 400 }
          );
        }
        
        const result = await getAuditLogById(logId);
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
        
        const result = await getAuditStatistics(filters);
        return NextResponse.json(result);
      }
      
      case 'list':
      default: {
        const startDateStr = searchParams.get('startDate');
        const endDateStr = searchParams.get('endDate');
        const userId = searchParams.get('userId');
        const department = searchParams.get('department');
        const sopId = searchParams.get('sopId');
        const sopIdentifier = searchParams.get('sopIdentifier');
        const actionType = searchParams.get('actionType');
        const module = searchParams.get('module');
        const searchText = searchParams.get('searchText');
        const limit = parseInt(searchParams.get('limit') || '50');
        const page = parseInt(searchParams.get('page') || '1');
        const sortBy = searchParams.get('sortBy') || 'timestamp';
        const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
        
        const filters: any = {
          limit,
          skip: (page - 1) * limit,
          sortBy,
          sortOrder,
        };
        
        if (startDateStr) filters.startDate = new Date(startDateStr);
        if (endDateStr) filters.endDate = new Date(endDateStr);
        if (userId) filters.userId = userId;
        if (department) filters.department = department;
        if (sopId) filters.sopId = sopId;
        if (sopIdentifier) filters.sopIdentifier = sopIdentifier;
        if (actionType) filters.actionType = actionType;
        if (module) filters.module = module;
        if (searchText) filters.searchText = searchText;
        
        const result = await getAuditLogs(filters);
        return NextResponse.json(result);
      }
    }
  } catch (error: any) {
    console.error('Error in audit logs API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST - Log a new audit entry
 * Body: LogAuditParams
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate required fields
    const requiredFields = ['userId', 'userName', 'actionType', 'module'];
    
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
    
    const result = await logAudit({
      ...body,
      ipAddress,
      userAgent,
    });
    
    if (result.success) {
      return NextResponse.json(result, { status: 201 });
    } else {
      return NextResponse.json(
        { error: 'Failed to log audit', details: result.error },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error logging audit:', error);
    return NextResponse.json(
      { error: 'Failed to log audit', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT, PATCH, DELETE - Not allowed (audit logs are immutable)
 */
export async function PUT() {
  return NextResponse.json(
    { error: 'Audit logs cannot be updated' },
    { status: 403 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: 'Audit logs cannot be updated' },
    { status: 403 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Audit logs cannot be deleted' },
    { status: 403 }
  );
}
