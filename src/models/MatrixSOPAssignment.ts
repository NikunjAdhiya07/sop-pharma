import mongoose, { Document, Schema } from 'mongoose';

export interface IMatrixSOPAssignment extends Document {
  department: string;
  sopId: mongoose.Types.ObjectId;
  sopCode: string;
  sopName: string;
  effectiveMonth: number;
  effectiveYear: number;
  designationApplicability: string[];
  isActive: boolean;
  // Soft delete
  deletedAt?: Date;
  deletedBy?: string;
  // Audit
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MatrixSOPAssignmentSchema = new Schema<IMatrixSOPAssignment>(
  {
    department:               { type: String, required: true, index: true },
    sopId:                    { type: Schema.Types.ObjectId, ref: 'SOP', required: true },
    sopCode:                  { type: String, required: true, index: true },
    sopName:                  { type: String, required: true },
    effectiveMonth:           { type: Number, required: true, min: 1, max: 12 },
    effectiveYear:            { type: Number, required: true },
    designationApplicability: { type: [String], default: [] },
    isActive:                 { type: Boolean, default: true, index: true },
    deletedAt:                { type: Date },
    deletedBy:                { type: String },
    createdBy:                { type: String, required: true },
    updatedBy:                { type: String },
  },
  { timestamps: true },
);

// Prevent assigning the same SOP to the same department matrix twice (active only)
MatrixSOPAssignmentSchema.index(
  { department: 1, sopCode: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

export default mongoose.models.MatrixSOPAssignment ||
  mongoose.model<IMatrixSOPAssignment>('MatrixSOPAssignment', MatrixSOPAssignmentSchema);
