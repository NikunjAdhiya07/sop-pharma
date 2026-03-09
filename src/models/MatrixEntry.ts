import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * MatrixEntry — One record per (Employee, Department, Month, SOP)
 * Only created when a √ (training required) mark is found in the matrix.
 */
export interface IMatrixEntry extends Document {
  employeeName: string;
  designation?: string;
  department: string;
  year: number;
  month: number;       // 1-12
  monthName: string;   // 'January', 'February', ...
  sopCode: string;
  sourceFile: string;
  extractedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MatrixEntrySchema = new Schema<IMatrixEntry>({
  employeeName: { type: String, required: true, trim: true, index: true },
  designation:  { type: String, trim: true },
  department:   { type: String, required: true, trim: true, index: true },
  year:         { type: Number, required: true, index: true },
  month:        { type: Number, required: true, min: 1, max: 12, index: true },
  monthName:    { type: String, required: true },
  sopCode:      { type: String, required: true, trim: true, index: true },
  sourceFile:   { type: String, required: true },
  extractedAt:  { type: Date, default: Date.now },
}, { timestamps: true });

// Unique compound index — prevent duplicates on re-upload
MatrixEntrySchema.index(
  { employeeName: 1, department: 1, year: 1, month: 1, sopCode: 1 },
  { unique: true }
);
MatrixEntrySchema.index({ department: 1, year: 1, month: 1 });

const MatrixEntry: Model<IMatrixEntry> =
  mongoose.models.MatrixEntry ||
  mongoose.model<IMatrixEntry>('MatrixEntry', MatrixEntrySchema, 'matrixentries');

export default MatrixEntry;
