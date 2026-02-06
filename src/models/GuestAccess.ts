import mongoose from 'mongoose';

export interface IGuestAccess extends mongoose.Document {
  token: string;
  targetName: string;
  targetDob: Date;
  assignedTest: {
    sopIds: mongoose.Types.ObjectId[];
    questionCount: number;
    difficulty: string;
    testName: string; 
  };
  expiresAt: Date;
  status: 'pending' | 'started' | 'completed' | 'expired';
  createdBy: mongoose.Types.ObjectId;
  shadowUserId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GuestAccessSchema = new mongoose.Schema<IGuestAccess>({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  targetName: {
    type: String,
    required: true,
    trim: true,
  },
  targetDob: {
    type: Date,
    required: true,
  },
  assignedTest: {
    sopIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SOP',
      required: true
    }],
    questionCount: {
      type: Number,
      default: 20
    },
    difficulty: {
      type: String,
      default: 'Medium'
    },
    testName: {
      type: String,
      required: true
    }
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'started', 'completed', 'expired'],
    default: 'pending',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  shadowUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Auto-expire documents after they expire (TTL index)
// Note: This removes the RECORD, so we might want to keep it for history. 
// If we want history, we shouldn't use TTL. 
// Given the requirement is "Guest users... can only attempt the exam", maintaining logs is good.
// Let's NOT use TTL for now, but relying on application logic to check 'expiresAt'.

export default mongoose.models.GuestAccess || mongoose.model<IGuestAccess>('GuestAccess', GuestAccessSchema);
