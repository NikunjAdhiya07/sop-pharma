import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IReplacementRecord {
  similarityScore: number;
  oldQuestion: string;
  oldAnswer: string;
  oldOptions: string[];
  newQuestion: string;
  newAnswer: string;
  newOptions: string[];
}

export interface IBankResult {
  bankId: string;
  sopIdentifier: string;
  sopName: string;
  language: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  questionsReplaced: number;
  questionsFailed: number;
  remainingSimilar: number;
  autoResolveJobId?: string;
  logs: string[];
  replacements: IReplacementRecord[];
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface IBulkDeptJob extends Document {
  department: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  cancelled: boolean;
  bankIds: string[];
  progress: {
    banksTotal: number;
    banksProcessed: number;
    banksSucceeded: number;
    banksFailed: number;
    banksSkipped: number;
    totalQuestionsReplaced: number;
    totalQuestionsFailed: number;
  };
  bankResults: IBankResult[];
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

const ReplacementRecordSchema = new Schema<IReplacementRecord>({
  similarityScore: { type: Number, default: 0 },
  oldQuestion: { type: String, default: '' },
  oldAnswer: { type: String, default: '' },
  oldOptions: { type: [String], default: [] },
  newQuestion: { type: String, default: '' },
  newAnswer: { type: String, default: '' },
  newOptions: { type: [String], default: [] },
}, { _id: false });

const BankResultSchema = new Schema<IBankResult>({
  bankId: { type: String, required: true },
  sopIdentifier: { type: String, default: '' },
  sopName: { type: String, default: '' },
  language: { type: String, default: 'English' },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
    default: 'pending',
  },
  questionsReplaced: { type: Number, default: 0 },
  questionsFailed: { type: Number, default: 0 },
  remainingSimilar: { type: Number, default: 0 },
  autoResolveJobId: String,
  logs: { type: [String], default: [] },
  replacements: { type: [ReplacementRecordSchema], default: [] },
  error: String,
  startedAt: Date,
  completedAt: Date,
}, { _id: false });

const BulkDeptJobSchema = new Schema<IBulkDeptJob>({
  department: {
    type: String,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  },
  cancelled: {
    type: Boolean,
    default: false,
  },
  bankIds: {
    type: [String],
    default: [],
  },
  progress: {
    banksTotal: { type: Number, default: 0 },
    banksProcessed: { type: Number, default: 0 },
    banksSucceeded: { type: Number, default: 0 },
    banksFailed: { type: Number, default: 0 },
    banksSkipped: { type: Number, default: 0 },
    totalQuestionsReplaced: { type: Number, default: 0 },
    totalQuestionsFailed: { type: Number, default: 0 },
  },
  bankResults: {
    type: [BankResultSchema],
    default: [],
  },
  error: String,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  startedAt: Date,
  completedAt: Date,
});

const BulkDeptJob: Model<IBulkDeptJob> =
  mongoose.models.BulkDeptJob ||
  mongoose.model<IBulkDeptJob>('BulkDeptJob', BulkDeptJobSchema);

export default BulkDeptJob;
