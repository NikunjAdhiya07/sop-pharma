import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISOPGuideline extends Document {
  name: string;
  filePath: string;
  checklistItems: string[];
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SOPGuidelineSchema = new Schema<ISOPGuideline>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  checklistItems: {
    type: [String],
    default: [],
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

const SOPGuideline: Model<ISOPGuideline> = mongoose.models.SOPGuideline || mongoose.model<ISOPGuideline>('SOPGuideline', SOPGuidelineSchema);

export default SOPGuideline;
