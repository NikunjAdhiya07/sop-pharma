import AuditLog from '@/models/AuditLog';
import connectDB from '@/lib/mongodb';
import { NextRequest } from 'next/server';

interface LogOptions {
  action: 'EXAM_SUBMISSION' | 'EXAM_EVALUATION' | 'EXAM_START' | 'MCQ_GENERATION' | 'USER_LOGIN';
  userId: any;
  username: string;
  userFullName: string;
  targetId?: any;
  targetName?: string;
  details: any;
  request?: NextRequest | Request;
}

export async function logAction(options: LogOptions) {
  try {
    await connectDB();

    let ipAddress = 'unknown';
    let userAgent = 'unknown';

    if (options.request) {
      const forwarded = options.request.headers.get('x-forwarded-for');
      ipAddress = forwarded ? forwarded.split(',')[0] : 'unknown';
      userAgent = options.request.headers.get('user-agent') || 'unknown';
    }

    const logEntry = await AuditLog.create({
      action: options.action,
      userId: options.userId,
      username: options.username,
      userFullName: options.userFullName,
      targetId: options.targetId,
      targetName: options.targetName,
      details: options.details,
      ipAddress,
      userAgent,
    });

    console.log(`[AuditLog] Recorded ${options.action} for ${options.username}`);
    return logEntry;
  } catch (error) {
    console.error('[AuditLog] Failed to record log:', error);
    // Don't throw error to prevent breaking main application flow
    return null;
  }
}
