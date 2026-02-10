import mongoose from 'mongoose';

export interface IAccessLog extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
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
  timestamp: Date;
}

const AccessLogSchema = new mongoose.Schema<IAccessLog>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
    index: true,
  },
  userEmail: {
    type: String,
  },
  resourceType: {
    type: String,
    enum: ['mcq-bank', 'mcq-test', 'sop-library', 'test-result', 'review-center'],
    required: true,
    index: true,
  },
  resourceId: {
    type: String,
    index: true,
  },
  resourceName: {
    type: String,
  },
  action: {
    type: String,
    enum: ['view', 'access', 'start-test', 'submit-test', 'view-result', 'download'],
    required: true,
    index: true,
  },
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
  sessionId: {
    type: String,
    index: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Compound indexes for common queries
AccessLogSchema.index({ userId: 1, timestamp: -1 });
AccessLogSchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });
AccessLogSchema.index({ username: 1, resourceType: 1, timestamp: -1 });

// TTL index - automatically delete logs older than 1 year (optional)
AccessLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 }); // 365 days

const AccessLog = mongoose.models.AccessLog || mongoose.model<IAccessLog>('AccessLog', AccessLogSchema);

export default AccessLog;
