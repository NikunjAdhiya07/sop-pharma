import mongoose, { Document, Schema } from 'mongoose';

/**
 * Enhanced Audit Log Model - Tamper-proof, immutable audit trail
 * Records every important action in the SOP system
 */

export interface IAuditLog extends Document {
  // Auto-generated
  logId: string; // Unique log identifier
  timestamp: Date; // Server-side timestamp (immutable)
  
  // User Information
  userId: string;
  userName: string;
  userRole?: string;
  department?: string;
  
  // Action Details
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
  
  // SOP Reference
  sopId?: string;
  sopIdentifier?: string; // SOP-QA-001
  sopName?: string;
  
  // Module Context
  module: 'SOP Master' | 'Review' | 'Upload' | 'Exam' | 'Assignment' | 'Monitoring' | 'Library' | 'Admin';
  
  // Human-readable description (auto-generated)
  description: string;
  
  // Change Tracking
  oldValue?: any; // JSON object with previous values
  newValue?: any; // JSON object with updated values
  fieldsChanged?: string[]; // List of changed fields
  
  // Technical Details
  ipAddress: string;
  userAgent: string;
  browser?: string;
  device?: string;
  os?: string;
  sessionId?: string;
  
  // Additional Context
  relatedSopId?: string; // For merge operations
  relatedUserId?: string; // For assignment operations
  examScore?: number; // For exam submissions
  
  // Metadata
  isSystemGenerated: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical'; // Importance level
  
  // Immutability (no updates or deletes allowed)
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    logId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: () => new Date(), // Server-side timestamp
      immutable: true, // Cannot be changed
      index: true,
    },
    
    // User Information
    userId: {
      type: String,
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
      index: true,
    },
    userRole: String,
    department: {
      type: String,
      index: true,
    },
    
    // Action Details
    actionType: {
      type: String,
      required: true,
      enum: [
        'sop_created',
        'sop_edited',
        'sop_deleted',
        'sop_viewed',
        'sop_downloaded',
        'sop_assigned',
        'sop_review_date_changed',
        'sop_expiry_date_changed',
        'sop_version_updated',
        'sop_merged',
        'exam_started',
        'exam_submitted',
        'admin_data_changed',
        'bulk_import',
        'bulk_export',
      ],
      index: true,
    },
    
    // SOP Reference
    sopId: {
      type: String,
      index: true,
    },
    sopIdentifier: {
      type: String,
      index: true,
    },
    sopName: String,
    
    // Module Context
    module: {
      type: String,
      required: true,
      enum: ['SOP Master', 'Review', 'Upload', 'Exam', 'Assignment', 'Monitoring', 'Library', 'Admin'],
      index: true,
    },
    
    // Human-readable description
    description: {
      type: String,
      required: true,
      text: true, // Enable text search
    },
    
    // Change Tracking
    oldValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed,
    fieldsChanged: [String],
    
    // Technical Details
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    browser: String,
    device: String,
    os: String,
    sessionId: String,
    
    // Additional Context
    relatedSopId: String,
    relatedUserId: String,
    examScore: Number,
    
    // Metadata
    isSystemGenerated: {
      type: Boolean,
      default: false,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false, // We only use createdAt, no updatedAt
    collection: 'audit_logs_sop',
  }
);

// Compound Indexes for efficient querying
AuditLogSchema.index({ timestamp: -1 }); // Latest first
AuditLogSchema.index({ userId: 1, timestamp: -1 }); // User activity
AuditLogSchema.index({ sopId: 1, timestamp: -1 }); // SOP history
AuditLogSchema.index({ department: 1, timestamp: -1 }); // Department activity
AuditLogSchema.index({ actionType: 1, timestamp: -1 }); // Action-based queries
AuditLogSchema.index({ module: 1, timestamp: -1 }); // Module-based queries
AuditLogSchema.index({ timestamp: -1, actionType: 1, module: 1 }); // Combined filters

// Text index for search
AuditLogSchema.index({ description: 'text', sopIdentifier: 'text', userName: 'text' });

// Prevent updates and deletes
AuditLogSchema.pre('findOneAndUpdate', function(next) {
  next(new Error('Audit logs cannot be updated'));
});

AuditLogSchema.pre('findOneAndDelete', function(next) {
  next(new Error('Audit logs cannot be deleted'));
});

AuditLogSchema.pre('deleteOne', function(next) {
  next(new Error('Audit logs cannot be deleted'));
});

AuditLogSchema.pre('deleteMany', function(next) {
  next(new Error('Audit logs cannot be deleted'));
});

export default mongoose.models.AuditLogSOP || mongoose.model<IAuditLog>('AuditLogSOP', AuditLogSchema);
