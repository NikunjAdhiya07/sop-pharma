import mongoose, { Schema, Document, Model } from 'mongoose';
import { IMCQ } from './MCQBank';

export interface ISimilarQuestion extends Document {
  sopId: mongoose.Types.ObjectId;
  sopName: string;
  sopIdentifier: string;
  department: string;
  pageNumber?: number;
  
  // The main question that was flagged as similar
  primaryQuestion: {
    mcqBankId: mongoose.Types.ObjectId;
    questionIndex: number;
    question: IMCQ;
  };
  
  // All similar questions found
  similarQuestions: Array<{
    mcqBankId: mongoose.Types.ObjectId;
    questionIndex: number;
    question: IMCQ;
    similarityScore: number; // 0-100
    matchingText?: string; // Highlighted matching portions
  }>;
  
  // Review status
  reviewStatus: 'pending' | 'reviewed';
  
  // Actions taken
  actionTaken?: 'keep_primary' | 'keep_similar' | 'merge' | 'eliminate_all';
  keptQuestionIndex?: number; // Which question was kept (index in similarQuestions array, or -1 for primary)
  mergedQuestion?: IMCQ; // If merged, the resulting question
  
  // Audit trail
  flaggedAt: Date;
  flaggedBy?: string;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const SimilarQuestionSchema = new Schema<ISimilarQuestion>({
  sopId: {
    type: Schema.Types.ObjectId,
    ref: 'SOP',
    required: true,
    index: true,
  },
  sopName: {
    type: String,
    required: true,
  },
  sopIdentifier: {
    type: String,
    required: true,
    index: true,
  },
  department: {
    type: String,
    required: true,
    index: true,
  },
  pageNumber: {
    type: Number,
  },
  
  primaryQuestion: {
    mcqBankId: {
      type: Schema.Types.ObjectId,
      ref: 'MCQBank',
      required: true,
    },
    questionIndex: {
      type: Number,
      required: true,
    },
    question: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  
  similarQuestions: [{
    mcqBankId: {
      type: Schema.Types.ObjectId,
      ref: 'MCQBank',
      required: true,
    },
    questionIndex: {
      type: Number,
      required: true,
    },
    question: {
      type: Schema.Types.Mixed,
      required: true,
    },
    similarityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    matchingText: {
      type: String,
    },
  }],
  
  reviewStatus: {
    type: String,
    enum: ['pending', 'reviewed'],
    default: 'pending',
    index: true,
  },
  
  actionTaken: {
    type: String,
    enum: ['keep_primary', 'keep_similar', 'merge', 'eliminate_all'],
  },
  
  keptQuestionIndex: {
    type: Number,
  },
  
  mergedQuestion: {
    type: Schema.Types.Mixed,
  },
  
  flaggedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  
  flaggedBy: {
    type: String,
  },
  
  reviewedAt: {
    type: Date,
  },
  
  reviewedBy: {
    type: String,
  },
  
  reviewNotes: {
    type: String,
  },
}, {
  timestamps: true,
});

// Indexes for efficient querying
SimilarQuestionSchema.index({ sopId: 1, reviewStatus: 1 });
SimilarQuestionSchema.index({ department: 1, reviewStatus: 1 });
SimilarQuestionSchema.index({ sopIdentifier: 1, reviewStatus: 1 });
SimilarQuestionSchema.index({ reviewStatus: 1, flaggedAt: -1 });

// Prevent duplicate flagging of the same question pair
SimilarQuestionSchema.index({ 
  'primaryQuestion.mcqBankId': 1, 
  'primaryQuestion.questionIndex': 1 
}, { unique: true });

const SimilarQuestion: Model<ISimilarQuestion> = 
  mongoose.models.SimilarQuestion || 
  mongoose.model<ISimilarQuestion>('SimilarQuestion', SimilarQuestionSchema);

export default SimilarQuestion;
