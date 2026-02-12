import mongoose, { Schema, Document, Model } from 'mongoose';
import { IMCQ } from './MCQBank';

export interface IEliminatedQuestion extends Document {
  sopId: mongoose.Types.ObjectId;
  sopName: string;
  sopIdentifier: string;
  question: IMCQ;
  originalQuestionIndex?: number; // The index of the question in the original bank
  originalIndex?: number;         // Fallback field
  eliminationReason: 'duplicate' | 'content-mismatch' | 'manual';
  eliminatedAt: Date;
  eliminatedBy?: string;
  duplicateOf?: string;
  similarityScore?: number;
  replacedWith?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EliminatedQuestionSchema = new Schema<IEliminatedQuestion>({
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
  question: {
    type: Schema.Types.Mixed,
    required: true,
  },
  originalQuestionIndex: {
    type: Number,
  },
  originalIndex: {
    type: Number,
  },
  eliminationReason: {
    type: String,
    enum: ['duplicate', 'content-mismatch', 'manual'],
    required: true,
    index: true,
  },
  eliminatedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  eliminatedBy: {
    type: String,
  },
  duplicateOf: {
    type: String,
  },
  similarityScore: {
    type: Number,
    min: 0,
    max: 100,
  },
  replacedWith: {
    type: String,
  },
}, {
  timestamps: true,
});

// Indexes for efficient querying
EliminatedQuestionSchema.index({ sopId: 1, eliminatedAt: -1 });
EliminatedQuestionSchema.index({ eliminationReason: 1, eliminatedAt: -1 });
EliminatedQuestionSchema.index({ sopIdentifier: 1, eliminationReason: 1 });

const EliminatedQuestion: Model<IEliminatedQuestion> = 
  mongoose.models.EliminatedQuestion || 
  mongoose.model<IEliminatedQuestion>('EliminatedQuestion', EliminatedQuestionSchema);

export default EliminatedQuestion;
