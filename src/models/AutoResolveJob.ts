import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAutoResolveJob extends Document {
  mcqBankId: mongoose.Types.ObjectId;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    clustersFound: number;
    clustersProcessed: number;
    questionsReplaced: number;
    questionsFailed: number;
  };
  summary?: {
    found: number;
    eligible: number;
    replaced: number;
    kept: number;
    failed: number;
    eliminatedCount: number;
  };
  error?: string;
  logs: string[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

const AutoResolveJobSchema = new Schema<IAutoResolveJob>({
  mcqBankId: {
    type: Schema.Types.ObjectId,
    ref: 'MCQBank',
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
    index: true,
  },
  progress: {
    clustersFound: { type: Number, default: 0 },
    clustersProcessed: { type: Number, default: 0 },
    questionsReplaced: { type: Number, default: 0 },
    questionsFailed: { type: Number, default: 0 },
  },
  summary: {
    type: {
      found: Number,
      eligible: Number,
      replaced: Number,
      kept: Number,
      failed: Number,
      eliminatedCount: Number,
    },
    default: null,
  },
  error: String,
  logs: {
    type: [String],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  startedAt: Date,
  completedAt: Date,
});

const AutoResolveJob: Model<IAutoResolveJob> =
  mongoose.models.AutoResolveJob ||
  mongoose.model<IAutoResolveJob>('AutoResolveJob', AutoResolveJobSchema);

export default AutoResolveJob;
