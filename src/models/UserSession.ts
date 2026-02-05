import mongoose, { Document, Schema } from 'mongoose';

// User Session Tracking - Track user login/logout and session activity
export interface IUserSession extends Document {
  // User Information
  userId: string;
  userName: string;
  userRole: string;
  userDepartment?: string;
  userEmail?: string;
  
  // Session Details
  sessionId: string;
  sessionStart: Date;
  sessionEnd?: Date;
  sessionDuration?: number; // in seconds
  
  // Access Information
  ipAddress: string;
  userAgent: string;
  browser?: string;
  os?: string;
  device?: string;
  
  // Activity Summary
  actionsPerformed: number;
  sopsAccessed: string[]; // Array of SOP IDs
  lastActivityAt: Date;
  
  // Status
  isActive: boolean;
  logoutReason?: 'manual' | 'timeout' | 'forced' | 'system';
  
  createdAt: Date;
  updatedAt: Date;
}

const UserSessionSchema = new Schema<IUserSession>(
  {
    // User Information
    userId: {
      type: String,
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    userRole: {
      type: String,
      required: true,
    },
    userDepartment: String,
    userEmail: String,
    
    // Session Details
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sessionStart: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    sessionEnd: Date,
    sessionDuration: Number,
    
    // Access Information
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    browser: String,
    os: String,
    device: String,
    
    // Activity Summary
    actionsPerformed: {
      type: Number,
      default: 0,
    },
    sopsAccessed: [String],
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    
    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    logoutReason: {
      type: String,
      enum: ['manual', 'timeout', 'forced', 'system'],
    },
  },
  {
    timestamps: true,
    collection: 'user_sessions',
  }
);

// Indexes
UserSessionSchema.index({ userId: 1, sessionStart: -1 });
UserSessionSchema.index({ isActive: 1, lastActivityAt: -1 });

export default mongoose.models.UserSession || mongoose.model<IUserSession>('UserSession', UserSessionSchema);
