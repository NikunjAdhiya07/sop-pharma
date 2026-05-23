const mongoose = require('mongoose');

const SOPSchema = new mongoose.Schema({}, { strict: false });
const TrainingMatrixUploadSchema = new mongoose.Schema({}, { strict: false });

async function countSops() {
  try {
    const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/sop-db';
    await mongoose.connect(mongoUrl);
    
    const SOP = mongoose.model('SOP', SOPSchema, 'sops');
    const TrainingMatrixUpload = mongoose.model('TrainingMatricesUpload', TrainingMatrixUploadSchema, 'trainingmatricesupload');
    
    // Count Store SOPs
    const storeSOPs = await SOP.find({ department: 'Store', isObsolete: { $ne: true } }).lean();
    console.log('Store SOPs (not obsolete):', storeSOPs.length);
    console.log('Store SOP codes:', storeSOPs.map(s => s.identifier).sort());
    
    // Get latest Store training matrix upload
    const latestUpload = await TrainingMatrixUpload.findOne({ department: 'Store' }).sort({ uploadedAt: -1 });
    if (latestUpload && latestUpload.snapshot) {
      console.log('\nLatest Store Upload snapshot sopCodes count:', latestUpload.snapshot.sopCodes?.length);
      console.log('Snapshot sopCodes:', latestUpload.snapshot.sopCodes?.sort());
    }
    
    // Total SOP count
    const totalSops = await SOP.countDocuments({ isObsolete: { $ne: true } });
    console.log('\nTotal SOPs (not obsolete):', totalSops);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

countSops();
