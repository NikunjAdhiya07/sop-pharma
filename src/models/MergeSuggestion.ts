import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMergeSuggestion extends Document {
  sopIds: mongoose.Types.ObjectId[];
  sopNames: string[];
  reason: string;
  similarityScore: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const MergeSuggestionSchema = new Schema<IMergeSuggestion>({
  sopIds: [{
    type: Schema.Types.ObjectId,
    ref: 'SOPLibrary',
    required: true,
  }],
  sopNames: [{
    type: String,
    required: true,
  }],
  reason: {
    type: String,
    required: true,
    trim: true,
  },
  similarityScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
}, {
  timestamps: true,
});

const MergeSuggestion: Model<IMergeSuggestion> = mongoose.models.MergeSuggestion || mongoose.model<IMergeSuggestion>('MergeSuggestion', MergeSuggestionSchema);

export default MergeSuggestion;
