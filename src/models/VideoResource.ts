import mongoose from 'mongoose';

export interface IVideoResource extends mongoose.Document {
  title: string;
  description?: string;
  url: string; // URL to video file or stream
  thumbnailUrl?: string;
  duration: number; // Length in seconds
  sopId?: mongoose.Types.ObjectId; // Optional link to an SOP
  department?: string;
  requiredForInduction: boolean;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VideoResourceSchema = new mongoose.Schema<IVideoResource>({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: String,
  url: {
    type: String,
    required: true,
  },
  thumbnailUrl: String,
  duration: {
    type: Number,
    required: true, // Expected in seconds
  },
  sopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SOP',
  },
  department: {
    type: String,
    index: true,
  },
  requiredForInduction: {
    type: Boolean,
    default: false,
    index: true,
  },
  order: {
    type: Number,
    default: 0,
  },
  active: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

export default mongoose.models.VideoResource || mongoose.model<IVideoResource>('VideoResource', VideoResourceSchema);
