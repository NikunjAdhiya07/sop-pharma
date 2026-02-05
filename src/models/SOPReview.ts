import mongoose, { Document, Schema } from 'mongoose';

// SOP Review History - Track all review cycles
export interface ISOPReview extends Document {
  // SOP Reference
  sopId: mongoose.Types.ObjectId;
  sopIdentifier: string;
  sopName: string;
  sopVersion: string;
  
  // Review Details
  reviewType: 'scheduled' | 'ad-hoc' | 'post-incident' | 'regulatory' | 'annual';
  reviewStatus: 'pending' | 'in-progress' | 'completed' | 'overdue' | 'cancelled';
  
  // Reviewer Information
  assignedTo: string; // User ID
  assignedToName: string;
  assignedBy: string;
  assignedByName: string;
  assignedAt: Date;
  
  // Timeline
  dueDate: Date;
  startedAt?: Date;
  completedAt?: Date;
  
  // Review Outcome
  outcome?: 'approved' | 'approved-with-changes' | 'rejected' | 'requires-revision';
  findings?: string; // What was found during review
  recommendations?: string; // Suggested improvements
  changesRequired?: string[]; // List of required changes
  
  // Approval Chain
  approvers?: Array<{
    userId: string;
    userName: string;
    role: string;
    status: 'pending' | 'approved' | 'rejected';
    comments?: string;
    timestamp?: Date;
  }>;
  
  // Compliance
  regulatoryRequirement?: string; // Which regulation triggered this
  complianceStatus?: 'compliant' | 'non-compliant' | 'partial';
  
  // Metadata
  priority: 'low' | 'medium' | 'high' | 'critical';
  department: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const SOPReviewSchema = new Schema<ISOPReview>(
  {
    // SOP Reference
    sopId: {
      type: Schema.Types.ObjectId,
      ref: 'SOP',
      required: true,
      index: true,
    },
    sopIdentifier: {
      type: String,
      required: true,
    },
    sopName: {
      type: String,
      required: true,
    },
    sopVersion: {
      type: String,
      required: true,
    },
    
    // Review Details
    reviewType: {
      type: String,
      enum: ['scheduled', 'ad-hoc', 'post-incident', 'regulatory', 'annual'],
      required: true,
    },
    reviewStatus: {
      type: String,
      enum: ['pending', 'in-progress', 'completed', 'overdue', 'cancelled'],
      required: true,
      default: 'pending',
      index: true,
    },
    
    // Reviewer Information
    assignedTo: {
      type: String,
      required: true,
      index: true,
    },
    assignedToName: {
      type: String,
      required: true,
    },
    assignedBy: {
      type: String,
      required: true,
    },
    assignedByName: {
      type: String,
      required: true,
    },
    assignedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    
    // Timeline
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    startedAt: Date,
    completedAt: Date,
    
    // Review Outcome
    outcome: {
      type: String,
      enum: ['approved', 'approved-with-changes', 'rejected', 'requires-revision'],
    },
    findings: String,
    recommendations: String,
    changesRequired: [String],
    
    // Approval Chain
    approvers: [{
      userId: String,
      userName: String,
      role: String,
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
      },
      comments: String,
      timestamp: Date,
    }],
    
    // Compliance
    regulatoryRequirement: String,
    complianceStatus: {
      type: String,
      enum: ['compliant', 'non-compliant', 'partial'],
    },
    
    // Metadata
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    department: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'sop_reviews',
  }
);

// Indexes
SOPReviewSchema.index({ sopId: 1, createdAt: -1 });
SOPReviewSchema.index({ assignedTo: 1, reviewStatus: 1 });
SOPReviewSchema.index({ dueDate: 1, reviewStatus: 1 });
SOPReviewSchema.index({ department: 1, reviewStatus: 1 });

export default mongoose.models.SOPReview || mongoose.model<ISOPReview>('SOPReview', SOPReviewSchema);
