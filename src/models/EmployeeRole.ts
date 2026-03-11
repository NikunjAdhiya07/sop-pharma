import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEmployeeRole extends Document {
  name: string;
  employeeName: string;
  department: string;
  description: string;
  sops: {
    sopIdentifier: string;
    sopName: string;
    examApplicable: boolean;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeRoleSchema = new Schema<IEmployeeRole>({
  name: {
    type: String,
    required: true,
  },
  employeeName: {
    type: String,
    required: true,
  },
  department: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: false,
  },
  sops: [{
    sopIdentifier: { type: String, required: true },
    sopName: { type: String, required: true },
    examApplicable: { type: Boolean, default: true },
  }],
}, { timestamps: true });

export default mongoose.models.EmployeeRole || mongoose.model<IEmployeeRole>('EmployeeRole', EmployeeRoleSchema);
