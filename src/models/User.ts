import mongoose from 'mongoose';

export interface IUser extends mongoose.Document {
  username: string;
  password: string;
  name: string;
  role: 'admin' | 'user' | 'trainer' | 'qa-head';
  employeeId?: string;
  department?: string;
  email?: string;
  isTrainerEligible: boolean;
  testsCompleted: number;
  testsAssigned: number;
  averageScore: number;
  allowedSections: string[]; // Sections/modules the user can access
  allowedDepartments: string[]; // Departments the user can access (e.g., ['QA', 'QC'])
  createdAt: Date;
  lastLogin?: Date;
  trainingStage: 'induction' | 'active' | 'certified';
  inductionProgress: {
    videosWatched: mongoose.Types.ObjectId[];
    sopsRead: mongoose.Types.ObjectId[];
    completed: boolean;
  };
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
    enum: ['admin', 'user', 'trainer', 'qa-head'],
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
        return ['dashboard', 'sop-upload', 'mcq-bank', 'bulk-process', 'files-manager', 'admin', 'mcq-tests', 'sop-scheduler'];
      } else if (this.role === 'trainer') {
        return ['dashboard', 'sop-upload', 'mcq-bank', 'mcq-tests', 'sop-scheduler'];
      } else {
        return ['dashboard', 'mcq-tests', 'sop-scheduler'];
      }
    },
  },
  allowedDepartments: {
    type: [String],
    default: function() {
      // Admin and QA Head get all departments by default
      if (this.role === 'admin' || this.role === 'qa-head') {
        return ['QA', 'QC', 'Microbiology', 'Production', 'Store', 'Engineering and Maintenance', 'Personnel'];
      }
      // Regular users get department based on their assigned department
      return this.department ? [this.department] : [];
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLogin: {
    type: Date,
  },
  trainingStage: {
    type: String,
    enum: ['induction', 'active', 'certified'],
    default: 'active', // Default to active for existing users/manual creation, unless specified
  },
  inductionProgress: {
    videosWatched: [{ type: mongoose.Schema.Types.ObjectId, ref: 'VideoResource' }],
    sopsRead: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SOP' }],
    completed: { type: Boolean, default: false }
  }
});

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
