import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  action: 'EXAM_SUBMISSION' | 'EXAM_EVALUATION' | 'EXAM_START' | 'MCQ_GENERATION' | 'USER_LOGIN';
  userId: mongoose.Types.ObjectId;
  username: string;
  userFullName: string;
  targetId?: mongoose.Types.ObjectId; // ID of the related SOP, MCQ Bank, or Test Result
  targetName?: string; // Name of the SOP or Test
  details: any; // Flexible field for detailed action metadata
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  action: {
    type: String,
    required: true,
    enum: ['EXAM_SUBMISSION', 'EXAM_EVALUATION', 'EXAM_START', 'MCQ_GENERATION', 'USER_LOGIN'],
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
  },
  userFullName: {
    type: String,
    required: true,
  },
  targetId: {
    type: Schema.Types.ObjectId,
    index: true,
  },
  targetName: {
    type: String,
  },
  details: {
    type: Schema.Types.Mixed,
    required: true,
  },
  ipAddress: String,
  userAgent: String,
}, {
  timestamps: true,
});

// Index for efficient chronological review
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

export default mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
