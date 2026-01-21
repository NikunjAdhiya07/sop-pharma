import mongoose from 'mongoose';

export interface IUser extends mongoose.Document {
  username: string;
  password: string;
  name: string;
  role: 'admin' | 'user' | 'trainer';
  employeeId?: string;
  department?: string;
  email?: string;
  isTrainerEligible: boolean;
  testsCompleted: number;
  testsAssigned: number;
  averageScore: number;
  allowedSections: string[]; // Sections/modules the user can access
  createdAt: Date;
  lastLogin?: Date;
}

const UserSchema = new mongoose.Schema<IUser>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['admin', 'user', 'trainer'],
    default: 'user',
  },
  employeeId: {
    type: String,
    trim: true,
  },
  department: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  isTrainerEligible: {
    type: Boolean,
    default: false,
  },
  testsCompleted: {
    type: Number,
    default: 0,
  },
  testsAssigned: {
    type: Number,
    default: 0,
  },
  averageScore: {
    type: Number,
    default: 0,
  },
  allowedSections: {
    type: [String],
    default: function() {
      // Default sections based on role
      if (this.role === 'admin') {
        return ['dashboard', 'sop-upload', 'mcq-bank', 'bulk-process', 'files-manager', 'admin', 'mcq-tests'];
      } else if (this.role === 'trainer') {
        return ['dashboard', 'sop-upload', 'mcq-bank', 'mcq-tests'];
      } else {
        return ['dashboard', 'mcq-tests'];
      }
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLogin: {
    type: Date,
  },
});

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
