import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDepartmentTrainer extends Document {
  departmentName?: string;
  trainerName: string;
  sopIdentifier?: string;
  sopName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentTrainerSchema = new Schema<IDepartmentTrainer>({
  departmentName: {
    type: String,
    required: false,
    trim: true,
    // No index here — departmentName is NOT unique (many SOPs share the same dept)
  },
  sopIdentifier: {
    type: String,
    required: false,
    trim: true,
    // Sparse so null/missing values don't collide
    index: { sparse: true },
  },
  sopName: {
    type: String,
    required: false,
    trim: true,
  },
  trainerName: {
    type: String,
    required: true,
    trim: true,
  },
}, {
  timestamps: true,
});

// Drop any stale unique index on departmentName that may exist from older schema versions.
// Wrapped in try/catch so it's a no-op if the index doesn't exist.
DepartmentTrainerSchema.post('init', async function () {
  // Runs once per model load, not per document — see below.
});

async function dropStaleIndexes(model: Model<IDepartmentTrainer>) {
  try {
    await model.collection.dropIndex('departmentName_1');
  } catch {
    // Index doesn't exist — nothing to do.
  }
}

let DepartmentTrainer: Model<IDepartmentTrainer>;

if (mongoose.models.DepartmentTrainer) {
  DepartmentTrainer = mongoose.models.DepartmentTrainer as Model<IDepartmentTrainer>;
} else {
  DepartmentTrainer = mongoose.model<IDepartmentTrainer>('DepartmentTrainer', DepartmentTrainerSchema);
}

// Fire-and-forget index cleanup (runs once after the model is registered).
dropStaleIndexes(DepartmentTrainer);

export default DepartmentTrainer;
