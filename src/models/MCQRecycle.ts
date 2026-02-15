import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOptionVariant {
  text: string;
  isCorrect: boolean;
}

export interface IQuestionData {
  aiIcon: string;
  question: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
  optionVariants: IOptionVariant[];
}

export interface IMCQRecycle extends Document {
  // Original review reference
  originalReviewId: mongoose.Types.ObjectId;
  originalMcqBankId: mongoose.Types.ObjectId;
  originalQuestionIndex: number;
  
  // SOP reference
  sopId: mongoose.Types.ObjectId;
  sopName: string;
  sopIdentifier: string;
  
  // Old version of the question (the one being replaced)
  oldVersion: IQuestionData;
  
  // New version reference (for tracking)
  newVersion: IQuestionData;
  
  // Metadata
  replacedBy: string; // User who marked as completed and triggered replacement
  replacedAt: Date;
  recycleReason: string; // Why it was replaced
  
  // Folder structure (similar to Similar Questions)
  folderPath: string; // e.g., "QA/SOP-QA-001"
  
  // Restoration tracking
  isRestored: boolean;
  restoredBy?: string;
  restoredAt?: Date;
}

const OptionVariantSchema = new Schema<IOptionVariant>({
  text: {
    type: String,
    required: true,
  },
  isCorrect: {
    type: Boolean,
    required: true,
  },
}, { _id: false });

const QuestionDataSchema = new Schema<IQuestionData>({
  aiIcon: {
    type: String,
    required: true,
  },
  question: {
    type: String,
    required: true,
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    required: true,
  },
  difficultyStars: {
    type: String,
    enum: ['⭐', '⭐⭐', '⭐⭐⭐'],
    required: true,
  },
  options: {
    type: [String],
    required: true,
    validate: {
      validator: (v: string[]) => v.length === 4,
      message: 'Exactly 4 options are required',
    },
  },
  correctAnswer: {
    type: String,
    required: true,
  },
  explanation: {
    type: String,
    required: true,
  },
  sopReference: {
    type: String,
    required: true,
  },
  optionVariants: {
    type: [OptionVariantSchema],
    default: [],
  },
}, { _id: false });

const MCQRecycleSchema = new Schema<IMCQRecycle>({
  originalReviewId: {
    type: Schema.Types.ObjectId,
    ref: 'MCQReview',
    required: true,
  },
  originalMcqBankId: {
    type: Schema.Types.ObjectId,
    ref: 'MCQBank',
    required: true,
  },
  originalQuestionIndex: {
    type: Number,
    required: true,
  },
  sopId: {
    type: Schema.Types.ObjectId,
    ref: 'SOP',
    required: true,
  },
  sopName: {
    type: String,
    required: true,
  },
  sopIdentifier: {
    type: String,
    required: true,
  },
  oldVersion: {
    type: QuestionDataSchema,
    required: true,
  },
  newVersion: {
    type: QuestionDataSchema,
    required: true,
  },
  replacedBy: {
    type: String,
    required: true,
  },
  replacedAt: {
    type: Date,
    default: Date.now,
  },
  recycleReason: {
    type: String,
    default: 'Question updated during review',
  },
  folderPath: {
    type: String,
    required: true,
  },
  isRestored: {
    type: Boolean,
    default: false,
  },
  restoredBy: {
    type: String,
  },
  restoredAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Indexes for efficient querying
MCQRecycleSchema.index({ sopId: 1 });
MCQRecycleSchema.index({ sopIdentifier: 1 });
MCQRecycleSchema.index({ folderPath: 1 });
MCQRecycleSchema.index({ isRestored: 1 });
MCQRecycleSchema.index({ originalReviewId: 1 });

const MCQRecycle: Model<IMCQRecycle> = mongoose.models.MCQRecycle || mongoose.model<IMCQRecycle>('MCQRecycle', MCQRecycleSchema);

export default MCQRecycle;
