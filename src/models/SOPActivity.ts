import mongoose, { Document, Schema } from 'mongoose';

// SOP Activity Log - Tracks every action performed on SOPs
export interface ISOPActivity extends Document {
  // Core Identifiers
  sopId: mongoose.Types.ObjectId;
  sopIdentifier: string; // SOP-QA-001
  sopName: string;
  
  // User Information
  userId: string;
  userName: string;
  userRole: string;
  userDepartment?: string;
  
  // Action Details
  actionType: 'created' | 'updated' | 'reviewed' | 'approved' | 'rejected' | 'downloaded' | 'viewed' | 'expired' | 'deleted' | 'restored' | 'merged';
  actionCategory: 'lifecycle' | 'content' | 'access' | 'compliance' | 'administrative';
  
  // Timestamp (Precise date & time)
  timestamp: Date;
  
  // Change Tracking
  fieldsChanged?: string[]; // ['reviewDate', 'owner', 'version']
  previousValues?: Record<string, any>; // { reviewDate: '2024-01-01', owner: 'John' }
  updatedValues?: Record<string, any>; // { reviewDate: '2024-02-01', owner: 'Jane' }
  
  // Context & Reason
  reason?: string; // Why was this action taken?
  comments?: string; // Additional notes
  
  // Metadata
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  
  // Compliance & Audit
  requiresApproval?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: Date;
  
  // System Info
  systemGenerated: boolean; // Auto vs manual action
  relatedActivityId?: mongoose.Types.ObjectId; // Link to parent activity
  
  createdAt: Date;
  updatedAt: Date;
}

const SOPActivitySchema = new Schema<ISOPActivity>(
  {
    // Core Identifiers
    sopId: {
      type: Schema.Types.ObjectId,
      ref: 'SOP',
      required: true,
      index: true,
    },
    sopIdentifier: {
      type: String,
      required: true,
      index: true,
    },
    sopName: {
      type: String,
      required: true,
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
    },
    userRole: {
      type: String,
      required: true,
      index: true,
    },
    userDepartment: {
      type: String,
      index: true,
    },
    
    // Action Details
    actionType: {
      type: String,
      enum: ['created', 'updated', 'reviewed', 'approved', 'rejected', 'downloaded', 'viewed', 'expired', 'deleted', 'restored', 'merged'],
      required: true,
      index: true,
    },
    actionCategory: {
      type: String,
      enum: ['lifecycle', 'content', 'access', 'compliance', 'administrative'],
      required: true,
      index: true,
    },
    
    // Timestamp
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    
    // Change Tracking
    fieldsChanged: [String],
    previousValues: Schema.Types.Mixed,
    updatedValues: Schema.Types.Mixed,
    
    // Context & Reason
    reason: String,
    comments: String,
    
    // Metadata
    ipAddress: String,
    userAgent: String,
    sessionId: String,
    
    // Compliance & Audit
    requiresApproval: {
      type: Boolean,
      default: false,
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
    },
    approvedBy: String,
    approvedAt: Date,
    
    // System Info
    systemGenerated: {
      type: Boolean,
      default: false,
    },
    relatedActivityId: {
      type: Schema.Types.ObjectId,
      ref: 'SOPActivity',
    },
  },
  {
    timestamps: true,
    collection: 'sop_activities',
  }
);

// Indexes for efficient querying
SOPActivitySchema.index({ timestamp: -1 }); // Most recent first
SOPActivitySchema.index({ sopId: 1, timestamp: -1 }); // SOP timeline
SOPActivitySchema.index({ userId: 1, timestamp: -1 }); // User activity
SOPActivitySchema.index({ actionType: 1, timestamp: -1 }); // Action-based queries
SOPActivitySchema.index({ userDepartment: 1, timestamp: -1 }); // Department analytics

export default mongoose.models.SOPActivity || mongoose.model<ISOPActivity>('SOPActivity', SOPActivitySchema);
