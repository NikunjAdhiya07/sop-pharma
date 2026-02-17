import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ApplicableFinding Model - SOP Section-Based Compilation
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Store findings marked as "applicable" for implementation, grouped by
 * SOP section, with compiled verbiage that addresses all issues in that section.
 * 
 * WORKFLOW:
 * 1. User marks findings as "applicable" from compliance report
 * 2. System groups findings by SOP section (e.g., Section 5.3)
 * 3. System compiles all proposed verbiage for that section
 * 4. User reviews and implements the compiled text
 */

export interface IApplicableFinding extends Document {
  // ═════════════════════════════════════════════════════════════════════
  // 1. REPORT REFERENCE
  // ═════════════════════════════════════════════════════════════════════
  reportId: mongoose.Types.ObjectId;
  sopId: mongoose.Types.ObjectId;
  sopIdentifier: string;
  sopName: string;
  department: string;
  
  // ═════════════════════════════════════════════════════════════════════
  // 2. SOP SECTION GROUPING
  // ═════════════════════════════════════════════════════════════════════
  sopSection: string;              // e.g., "Section 5.3"
  sopSectionTitle: string;         // e.g., "Equipment Maintenance"
  sopSectionNumber: string;        // e.g., "5.3"
  
  // ═════════════════════════════════════════════════════════════════════
  // 3. INDIVIDUAL FINDINGS (Marked as applicable)
  // ═════════════════════════════════════════════════════════════════════
  findings: {
    findingId: string;             // Reference to original finding
    guidelineName: string;
    clauseNumber: string;
    clauseTitle: string;
    issueSeverity: 'critical' | 'major' | 'minor' | 'informational';
    specificGap: string;
    suggestedAction: string;
    proposedVerbiage: string;      // Individual proposed text
    markedAt: Date;
    markedBy: mongoose.Types.ObjectId;
  }[];
  
  // ═════════════════════════════════════════════════════════════════════
  // 4. COMPILED VERBIAGE (Combined solution for the section)
  // ═════════════════════════════════════════════════════════════════════
  compiledVerbiage: string;        // AI-generated comprehensive text
  compilationMethod: 'auto' | 'manual' | 'hybrid';
  compiledAt?: Date;
  compiledBy?: mongoose.Types.ObjectId;
  
  // ═════════════════════════════════════════════════════════════════════
  // 5. IMPLEMENTATION STATUS
  // ═════════════════════════════════════════════════════════════════════
  implementationStatus: 'pending' | 'in-progress' | 'completed' | 'rejected';
  implementedAt?: Date;
  implementedBy?: mongoose.Types.ObjectId;
  implementationNotes?: string;
  
  // ═════════════════════════════════════════════════════════════════════
  // 6. METADATA
  // ═════════════════════════════════════════════════════════════════════
  createdAt: Date;
  updatedAt: Date;
}

const ApplicableFindingSchema = new Schema<IApplicableFinding>({
  // 1. REPORT REFERENCE
  reportId: {
    type: Schema.Types.ObjectId,
    ref: 'ComplianceReport',
    required: true,
    index: true,
  },
  sopId: {
    type: Schema.Types.ObjectId,
    ref: 'SOP',
    required: true,
    index: true,
  },
  sopIdentifier: {
    type: String,
    required: true,
    trim: true,
  },
  sopName: {
    type: String,
    required: true,
    trim: true,
  },
  department: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  
  // 2. SOP SECTION GROUPING
  sopSection: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  sopSectionTitle: {
    type: String,
    required: true,
    trim: true,
  },
  sopSectionNumber: {
    type: String,
    required: true,
    trim: true,
  },
  
  // 3. INDIVIDUAL FINDINGS
  findings: [{
    findingId: { type: String, required: true },
    guidelineName: { type: String, required: true },
    clauseNumber: { type: String, required: true },
    clauseTitle: { type: String, required: true },
    issueSeverity: {
      type: String,
      enum: ['critical', 'major', 'minor', 'informational'],
      required: true,
    },
    specificGap: { type: String, required: true },
    suggestedAction: { type: String, required: true },
    proposedVerbiage: { type: String, required: true },
    markedAt: { type: Date, default: Date.now },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  }],
  
  // 4. COMPILED VERBIAGE
  compiledVerbiage: {
    type: String,
    default: '',
  },
  compilationMethod: {
    type: String,
    enum: ['auto', 'manual', 'hybrid'],
    default: 'auto',
  },
  compiledAt: {
    type: Date,
  },
  compiledBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  
  // 5. IMPLEMENTATION STATUS
  implementationStatus: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'rejected'],
    default: 'pending',
    index: true,
  },
  implementedAt: {
    type: Date,
  },
  implementedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  implementationNotes: {
    type: String,
  },
}, {
  timestamps: true,
});

// Indexes for efficient querying
ApplicableFindingSchema.index({ sopId: 1, sopSection: 1 });
ApplicableFindingSchema.index({ reportId: 1 });
ApplicableFindingSchema.index({ implementationStatus: 1 });
ApplicableFindingSchema.index({ department: 1, implementationStatus: 1 });

const ApplicableFinding: Model<IApplicableFinding> = mongoose.models.ApplicableFinding || mongoose.model<IApplicableFinding>('ApplicableFinding', ApplicableFindingSchema);

export default ApplicableFinding;
