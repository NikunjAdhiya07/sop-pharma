import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDepartmentTrainer extends Document {
  departmentName?: string;
  trainerName: string;
  sopIdentifier?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentTrainerSchema = new Schema<IDepartmentTrainer>({
  departmentName: {
    type: String,
    required: false,
    trim: true,
    index: true,
  },
  sopIdentifier: {
    type: String,
    required: false,
    trim: true,
    index: true,
  },
  trainerName: {
    type: String,
    required: true,
    trim: true,
  },
}, {
  timestamps: true,
});

const DepartmentTrainer: Model<IDepartmentTrainer> = mongoose.models.DepartmentTrainer || mongoose.model<IDepartmentTrainer>('DepartmentTrainer', DepartmentTrainerSchema);

export default DepartmentTrainer;
