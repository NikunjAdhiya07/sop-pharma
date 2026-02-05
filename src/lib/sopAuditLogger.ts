import AuditLogSOP from '@/models/AuditLogSOP';
import connectDB from '@/lib/mongodb';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

/**
 * Audit Logger - Automatic, tamper-proof logging for SOP system
 * Generates human-readable descriptions automatically
 */

export interface LogAuditParams {
  // User Information (required)
  userId: string;
  userName: string;
  userRole?: string;
  department?: string;
  
  // Action Details (required)
  actionType: 
    | 'sop_created'
    | 'sop_edited'
    | 'sop_deleted'
    | 'sop_viewed'
    | 'sop_downloaded'
    | 'sop_assigned'
    | 'sop_review_date_changed'
    | 'sop_expiry_date_changed'
    | 'sop_version_updated'
    | 'sop_merged'
    | 'exam_started'
    | 'exam_submitted'
    | 'admin_data_changed'
    | 'bulk_import'
    | 'bulk_export';
  
  module: 'SOP Master' | 'Review' | 'Upload' | 'Exam' | 'Assignment' | 'Monitoring' | 'Library' | 'Admin';
  
  // SOP Reference (optional, depends on action)
  sopId?: string;
  sopIdentifier?: string;
  sopName?: string;
  
  // Change Tracking (for edits)
  oldValue?: any;
  newValue?: any;
  fieldsChanged?: string[];
  
  // Technical Details
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  
  // Additional Context
  relatedSopId?: string;
  relatedUserId?: string;
  examScore?: number;
  
  // Metadata
  isSystemGenerated?: boolean;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Generate human-readable description based on action type
 */
function generateDescription(params: LogAuditParams): string {
  const { userName, actionType, sopIdentifier, sopName, oldValue, newValue, fieldsChanged, relatedSopId, examScore } = params;
  
  switch (actionType) {
    case 'sop_created':
      return `${userName} created SOP ${sopIdentifier}${sopName ? ` - ${sopName}` : ''}`;
    
    case 'sop_edited':
      if (fieldsChanged && fieldsChanged.length > 0) {
        const changes = fieldsChanged.map(field => {
          const oldVal = oldValue?.[field];
          const newVal = newValue?.[field];
          return `${field} from "${oldVal}" to "${newVal}"`;
        }).join(', ');
        return `${userName} updated ${changes} of ${sopIdentifier}`;
      }
      return `${userName} edited ${sopIdentifier}`;
    
    case 'sop_deleted':
      return `${userName} deleted ${sopIdentifier}${sopName ? ` - ${sopName}` : ''}`;
    
    case 'sop_viewed':
      return `${userName} viewed ${sopIdentifier}`;
    
    case 'sop_downloaded':
      return `${userName} downloaded ${sopIdentifier}`;
    
    case 'sop_assigned':
      return `${userName} assigned ${sopIdentifier} to user`;
    
    case 'sop_review_date_changed':
      const oldReviewDate = oldValue?.reviewDate ? format(new Date(oldValue.reviewDate), 'dd-MMM-yyyy') : 'not set';
      const newReviewDate = newValue?.reviewDate ? format(new Date(newValue.reviewDate), 'dd-MMM-yyyy') : 'not set';
      return `${userName} updated Review Date of ${sopIdentifier} from ${oldReviewDate} to ${newReviewDate}`;
    
    case 'sop_expiry_date_changed':
      const oldExpiryDate = oldValue?.expiryDate ? format(new Date(oldValue.expiryDate), 'dd-MMM-yyyy') : 'not set';
      const newExpiryDate = newValue?.expiryDate ? format(new Date(newValue.expiryDate), 'dd-MMM-yyyy') : 'not set';
      return `${userName} updated Expiry Date of ${sopIdentifier} from ${oldExpiryDate} to ${newExpiryDate}`;
    
    case 'sop_version_updated':
      const oldVersion = oldValue?.version || 'unknown';
      const newVersion = newValue?.version || 'unknown';
      return `${userName} updated version of ${sopIdentifier} from ${oldVersion} to ${newVersion}`;
    
    case 'sop_merged':
      return `${userName} merged ${sopIdentifier} into ${relatedSopId}`;
    
    case 'exam_started':
      return `${userName} started exam for ${sopIdentifier}`;
    
    case 'exam_submitted':
      const scoreText = examScore !== undefined ? ` (Score: ${examScore}%)` : '';
      return `${userName} submitted exam for ${sopIdentifier}${scoreText}`;
    
    case 'admin_data_changed':
      return `Admin ${userName} changed data for ${sopIdentifier}`;
    
    case 'bulk_import':
      return `${userName} performed bulk import of SOPs`;
    
    case 'bulk_export':
      return `${userName} performed bulk export of SOPs`;
    
    default:
      return `${userName} performed ${actionType} on ${sopIdentifier}`;
  }
}

/**
 * Parse user agent to extract browser, device, and OS
 */
function parseUserAgent(userAgent: string): { browser?: string; device?: string; os?: string } {
  const result: { browser?: string; device?: string; os?: string } = {};
  
  // Browser detection
  if (userAgent.includes('Chrome')) result.browser = 'Chrome';
  else if (userAgent.includes('Firefox')) result.browser = 'Firefox';
  else if (userAgent.includes('Safari')) result.browser = 'Safari';
  else if (userAgent.includes('Edge')) result.browser = 'Edge';
  else result.browser = 'Unknown';
  
  // Device detection
  if (userAgent.includes('Mobile')) result.device = 'Mobile';
  else if (userAgent.includes('Tablet')) result.device = 'Tablet';
  else result.device = 'Desktop';
  
  // OS detection
  if (userAgent.includes('Windows')) result.os = 'Windows';
  else if (userAgent.includes('Mac')) result.os = 'macOS';
  else if (userAgent.includes('Linux')) result.os = 'Linux';
  else if (userAgent.includes('Android')) result.os = 'Android';
  else if (userAgent.includes('iOS')) result.os = 'iOS';
  else result.os = 'Unknown';
  
  return result;
}

/**
 * Determine severity based on action type
 */
function determineSeverity(actionType: string): 'low' | 'medium' | 'high' | 'critical' {
  const criticalActions = ['sop_deleted', 'sop_merged', 'admin_data_changed'];
  const highActions = ['sop_created', 'sop_version_updated', 'sop_expiry_date_changed'];
  const mediumActions = ['sop_edited', 'sop_review_date_changed', 'exam_submitted'];
  
  if (criticalActions.includes(actionType)) return 'critical';
  if (highActions.includes(actionType)) return 'high';
  if (mediumActions.includes(actionType)) return 'medium';
  return 'low';
}

/**
 * Log an audit entry (automatic, tamper-proof)
 */
export async function logAudit(params: LogAuditParams) {
  try {
    await connectDB();
    
    // Generate unique log ID
    const logId = `LOG-${Date.now()}-${uuidv4().substring(0, 8)}`;
    
    // Generate human-readable description
    const description = generateDescription(params);
    
    // Parse user agent
    const { browser, device, os } = parseUserAgent(params.userAgent || 'Unknown');
    
    // Determine severity
    const severity = params.severity || determineSeverity(params.actionType);
    
    // Create audit log entry
    const auditLog = await AuditLogSOP.create({
      logId,
      timestamp: new Date(), // Server-side timestamp
      
      // User Information
      userId: params.userId,
      userName: params.userName,
      userRole: params.userRole,
      department: params.department,
      
      // Action Details
      actionType: params.actionType,
      module: params.module,
      
      // SOP Reference
      sopId: params.sopId,
      sopIdentifier: params.sopIdentifier,
      sopName: params.sopName,
      
      // Description
      description,
      
      // Change Tracking
      oldValue: params.oldValue,
      newValue: params.newValue,
      fieldsChanged: params.fieldsChanged,
      
      // Technical Details
      ipAddress: params.ipAddress || 'unknown',
      userAgent: params.userAgent || 'unknown',
      browser,
      device,
      os,
      sessionId: params.sessionId,
      
      // Additional Context
      relatedSopId: params.relatedSopId,
      relatedUserId: params.relatedUserId,
      examScore: params.examScore,
      
      // Metadata
      isSystemGenerated: params.isSystemGenerated || false,
      severity,
    });
    
    return {
      success: true,
      logId: auditLog.logId,
      description,
      timestamp: auditLog.timestamp,
    };
  } catch (error: any) {
    console.error('Error logging audit:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get audit logs with filters
 */
export async function getAuditLogs(filters: {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  department?: string;
  sopId?: string;
  sopIdentifier?: string;
  actionType?: string;
  module?: string;
  searchText?: string;
  limit?: number;
  skip?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  try {
    await connectDB();
    
    const query: any = {};
    
    // Date range filter
    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) query.timestamp.$gte = filters.startDate;
      if (filters.endDate) query.timestamp.$lte = filters.endDate;
    }
    
    // User filter
    if (filters.userId) query.userId = filters.userId;
    
    // Department filter
    if (filters.department) query.department = filters.department;
    
    // SOP filter
    if (filters.sopId) query.sopId = filters.sopId;
    if (filters.sopIdentifier) query.sopIdentifier = filters.sopIdentifier;
    
    // Action type filter
    if (filters.actionType) query.actionType = filters.actionType;
    
    // Module filter
    if (filters.module) query.module = filters.module;
    
    // Text search
    if (filters.searchText) {
      query.$text = { $search: filters.searchText };
    }
    
    // Sorting
    const sortField = filters.sortBy || 'timestamp';
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
    const sort: any = { [sortField]: sortOrder };
    
    // Execute query
    const logs = await AuditLogSOP.find(query)
      .sort(sort)
      .limit(filters.limit || 50)
      .skip(filters.skip || 0)
      .lean();
    
    // Get total count
    const total = await AuditLogSOP.countDocuments(query);
    
    return {
      success: true,
      logs,
      total,
      page: Math.floor((filters.skip || 0) / (filters.limit || 50)) + 1,
      totalPages: Math.ceil(total / (filters.limit || 50)),
    };
  } catch (error: any) {
    console.error('Error fetching audit logs:', error);
    return {
      success: false,
      error: error.message,
      logs: [],
      total: 0,
    };
  }
}

/**
 * Get single audit log by ID
 */
export async function getAuditLogById(logId: string) {
  try {
    await connectDB();
    
    const log = await AuditLogSOP.findOne({ logId }).lean();
    
    if (!log) {
      return {
        success: false,
        error: 'Audit log not found',
      };
    }
    
    return {
      success: true,
      log,
    };
  } catch (error: any) {
    console.error('Error fetching audit log:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get audit statistics
 */
export async function getAuditStatistics(filters?: {
  startDate?: Date;
  endDate?: Date;
  department?: string;
}) {
  try {
    await connectDB();
    
    const query: any = {};
    
    if (filters?.startDate || filters?.endDate) {
      query.timestamp = {};
      if (filters.startDate) query.timestamp.$gte = filters.startDate;
      if (filters.endDate) query.timestamp.$lte = filters.endDate;
    }
    
    if (filters?.department) {
      query.department = filters.department;
    }
    
    // Aggregate statistics
    const stats = await AuditLogSOP.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalLogs: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
          uniqueSOPs: { $addToSet: '$sopId' },
        },
      },
    ]);
    
    // Count by action type
    const actionTypeCounts = await AuditLogSOP.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$actionType',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);
    
    // Count by module
    const moduleCounts = await AuditLogSOP.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$module',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);
    
    // Top users
    const topUsers = await AuditLogSOP.aggregate([
      { $match: query },
      {
        $group: {
          _id: { userId: '$userId', userName: '$userName' },
          actionCount: { $sum: 1 },
        },
      },
      { $sort: { actionCount: -1 } },
      { $limit: 10 },
    ]);
    
    return {
      success: true,
      statistics: {
        totalLogs: stats[0]?.totalLogs || 0,
        uniqueUsers: stats[0]?.uniqueUsers?.length || 0,
        uniqueSOPs: stats[0]?.uniqueSOPs?.filter((id: any) => id).length || 0,
        actionTypeCounts,
        moduleCounts,
        topUsers,
      },
    };
  } catch (error: any) {
    console.error('Error fetching audit statistics:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}
