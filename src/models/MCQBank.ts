import mongoose, { Schema, Document, Model } from 'mongoose';

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';

export interface IOptionVariant {
  text: string;
  isCorrect: boolean;
}

export interface IMCQ {
  aiIcon: string;
  question: string;
  difficulty: DifficultyLevel;
  difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
  optionVariants: IOptionVariant[];
}

export interface IMCQBank extends Document {
  sopId: mongoose.Types.ObjectId;
  sopName: string;
  sopIdentifier: string;
  department: string;
  mcqs: IMCQ[];
  generatedAt: Date;
  totalQuestions: number;
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  aiModel?: string;
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

const MCQSchema = new Schema<IMCQ>({
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

const MCQBankSchema = new Schema<IMCQBank>({
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
  department: {
    type: String,
    required: true,
    default: 'General',
  },
  mcqs: {
    type: [MCQSchema],
    required: true,
    validate: {
      validator: (v: IMCQ[]) => v.length >= 1 && v.length <= 500,
      message: 'MCQs must be between 1 and 500 questions',
    },
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
  totalQuestions: {
    type: Number,
    required: true,
  },
  difficultyDistribution: {
    easy: {
      type: Number,
      default: 0,
    },
    medium: {
      type: Number,
      default: 0,
    },
    hard: {
      type: Number,
      default: 0,
    },
  },
  aiModel: {
    type: String,
    default: 'gemini-3-pro-preview',
  },
}, {
  timestamps: true,
});

// Indexes for efficient querying
MCQBankSchema.index({ sopId: 1 });
MCQBankSchema.index({ sopIdentifier: 1 });
MCQBankSchema.index({ department: 1 });
MCQBankSchema.index({ 'mcqs.difficulty': 1 });

const MCQBank: Model<IMCQBank> = mongoose.models.MCQBank || mongoose.model<IMCQBank>('MCQBank', MCQBankSchema);

export default MCQBank;
