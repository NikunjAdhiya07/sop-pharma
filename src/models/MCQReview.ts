import mongoose, { Schema, Document, Model } from 'mongoose';

export type ReviewStatus = 'pending' | 'done';

export interface IOptionVariant {
  text: string;
  isCorrect: boolean;
}

export interface IMCQReview extends Document {
  // Original question details
  originalMcqBankId: mongoose.Types.ObjectId;
  originalQuestionIndex: number;
  
  // SOP reference
  sopId: mongoose.Types.ObjectId;
  sopName: string;
  sopIdentifier: string;
  
  // Original question data
  originalQuestion: {
    aiIcon: string;
    question: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
    options: string[];
    correctAnswer: string;
    explanation: string;
    sopReference: string;
    optionVariants: IOptionVariant[];
  };
  
  // Edited question data (null if not yet edited)
  editedQuestion?: {
    aiIcon: string;
    question: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
    options: string[];
    correctAnswer: string;
    explanation: string;
    sopReference: string;
    optionVariants: IOptionVariant[];
  };
  
  // Review metadata
  reviewStatus: ReviewStatus;
  flaggedBy?: string; // User who flagged it
  flaggedAt: Date;
  reviewNotes?: string; // Why it was flagged
  editedBy?: string; // User who edited it
  editedAt?: Date;
  markedDoneBy?: string;
  markedDoneAt?: Date;
  
  // Version tracking
  versionNumber: number; // Tracks how many times this has been updated
  lastUpdatedVersion?: Date; // When the last version update occurred
  hasBeenRecycled: boolean; // Whether old version was moved to recycle
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

const QuestionDataSchema = new Schema({
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

const MCQReviewSchema = new Schema<IMCQReview>({
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
  originalQuestion: {
    type: QuestionDataSchema,
    required: true,
  },
  editedQuestion: {
    type: QuestionDataSchema,
    required: false,
  },
  reviewStatus: {
    type: String,
    enum: ['pending', 'done'],
    default: 'pending',
  },
  flaggedBy: {
    type: String,
  },
  flaggedAt: {
    type: Date,
    default: Date.now,
  },
  reviewNotes: {
    type: String,
  },
  editedBy: {
    type: String,
  },
  editedAt: {
    type: Date,
  },
  markedDoneBy: {
    type: String,
  },
  markedDoneAt: {
    type: Date,
  },
  versionNumber: {
    type: Number,
    default: 1,
  },
  lastUpdatedVersion: {
    type: Date,
  },
  hasBeenRecycled: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Indexes for efficient querying
MCQReviewSchema.index({ sopId: 1 });
MCQReviewSchema.index({ sopIdentifier: 1 });
MCQReviewSchema.index({ reviewStatus: 1 });
MCQReviewSchema.index({ originalMcqBankId: 1, originalQuestionIndex: 1 });

const MCQReview: Model<IMCQReview> = mongoose.models.MCQReview || mongoose.model<IMCQReview>('MCQReview', MCQReviewSchema);

export default MCQReview;
