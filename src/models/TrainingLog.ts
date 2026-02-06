import mongoose from 'mongoose';

export interface ITrainingLog extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  resourceType: 'video' | 'sop';
  resourceId: mongoose.Types.ObjectId; // ID of VideoResource or SOP
  resourceTitle: string; // Snapshot of title
  action: 'viewed' | 'completed';
  durationSeconds: number; // Time spent viewing
  progressPercent?: number; // For videos
  timestamp: Date;
  metadata?: any; // IP, session info, etc.
}

const TrainingLogSchema = new mongoose.Schema<ITrainingLog>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  resourceType: {
    type: String,
    enum: ['video', 'sop'],
    required: true,
    index: true,
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  resourceTitle: {
    type: String,
    required: true,
  },
  action: {
    type: String,
    enum: ['viewed', 'completed'],
    default: 'viewed',
  },
  durationSeconds: {
    type: Number,
    default: 0,
  },
  progressPercent: {
    type: Number,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  }
}, {
  timestamps: true, // Will add createdAt/updatedAt, though timestamp field is primary log time
  expireAfterSeconds: 60 * 60 * 24 * 365 * 2 // Retain logs for 2 years (Compliance)
});

// Indexes for reporting
TrainingLogSchema.index({ userId: 1, resourceType: 1, resourceId: 1 });

export default mongoose.models.TrainingLog || mongoose.model<ITrainingLog>('TrainingLog', TrainingLogSchema);
