/**
 * Access Logging Utility
 * Tracks user access to MCQ banks, tests, and SOP content
 */

import AccessLog from '@/models/AccessLog';
import connectDB from '@/lib/mongodb';

interface LogAccessParams {
  userId: string;
  username: string;
  userEmail?: string;
  resourceType: 'mcq-bank' | 'mcq-test' | 'sop-library' | 'test-result' | 'review-center';
  resourceId?: string;
  resourceName?: string;
  action: 'view' | 'access' | 'start-test' | 'submit-test' | 'view-result' | 'download';
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  metadata?: {
    mcqBankName?: string;
    sopTitle?: string;
    testScore?: number;
    questionsViewed?: number;
    duration?: number;
    [key: string]: any;
  };
}

/**
 * Log user access to resources
 */
export async function logAccess(params: LogAccessParams): Promise<void> {
  try {
    await connectDB();

    const accessLog = new AccessLog({
      userId: params.userId,
      username: params.username,
      userEmail: params.userEmail,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      resourceName: params.resourceName,
      action: params.action,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      sessionId: params.sessionId,
      metadata: params.metadata || {},
      timestamp: new Date(),
    });

    await accessLog.save();

    console.log(`📊 Access logged: ${params.username} ${params.action} ${params.resourceType} ${params.resourceName || params.resourceId || ''}`);
  } catch (error) {
    console.error('❌ Error logging access:', error);
    // Don't throw - logging should not break the main flow
  }
}

/**
 * Get access logs for a specific user
 */
export async function getUserAccessLogs(userId: string, limit = 100) {
  try {
    await connectDB();
    
    const logs = await AccessLog.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    
    return logs;
  } catch (error) {
    console.error('❌ Error fetching user access logs:', error);
    return [];
  }
}

/**
 * Get access logs for a specific resource
 */
export async function getResourceAccessLogs(resourceType: string, resourceId: string, limit = 100) {
  try {
    await connectDB();
    
    const logs = await AccessLog.find({ resourceType, resourceId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('userId', 'name username email')
      .lean();
    
    return logs;
  } catch (error) {
    console.error('❌ Error fetching resource access logs:', error);
    return [];
  }
}

/**
 * Get access statistics for admin dashboard
 */
export async function getAccessStats(days = 30) {
  try {
    await connectDB();
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const stats = await AccessLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            resourceType: '$resourceType',
            action: '$action'
          },
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          resourceType: '$_id.resourceType',
          action: '$_id.action',
          count: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      }
    ]);
    
    return stats;
  } catch (error) {
    console.error('❌ Error fetching access stats:', error);
    return [];
  }
}

/**
 * Get recent access logs for admin monitoring
 */
export async function getRecentAccessLogs(limit = 50) {
  try {
    await connectDB();
    
    const logs = await AccessLog.find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    
    return logs;
  } catch (error) {
    console.error('❌ Error fetching recent access logs:', error);
    return [];
  }
}

/**
 * Extract IP address from request headers
 */
export function getClientIP(headers: Headers): string | undefined {
  return (
    headers.get('x-forwarded-for')?.split(',')[0] ||
    headers.get('x-real-ip') ||
    headers.get('cf-connecting-ip') ||
    undefined
  );
}

/**
 * Extract user agent from request headers
 */
export function getUserAgent(headers: Headers): string | undefined {
  return headers.get('user-agent') || undefined;
}
