const mongoose = require('mongoose');

async function analyzeVersions() {
  try {
    const uri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';
    await mongoose.connect(uri);
    
    const db = mongoose.connection.db;
    const sops = db.collection('sops');
    const artifacts = db.collection('sopversionartifacts');
    
    console.log('\n📊 Version Pattern Analysis:\n');
    
    // Check a few SOPs to understand version storage pattern
    const testSOPs = ['MAGE01', 'MAGE02', 'MAGE04'];
    
    for (const sopCode of testSOPs) {
      console.log(`\n${sopCode}:`);
      
      // Get all SOP records for this code
      const sopRecords = await sops.find({ 
        identifier: { $regex: `^${sopCode}` } 
      }).toArray();
      
      console.log(`  English SOP Records:`);
      for (const sop of sopRecords.filter(s => s.language !== 'Gujarati').sort((a,b) => a.identifier.localeCompare(b.identifier))) {
        console.log(`    ${sop.identifier}: fileType=${sop.fileType}, fileVersion=${sop.version}`);
      }
      
      // Get artifact records
      const artifactEn = await artifacts.findOne({ identifier: sopCode, language: 'English' });
      if (artifactEn) {
        console.log(`  English Artifacts (SOPVersionArtifacts):`);
        for (const entry of artifactEn.entries.sort((a,b) => b.version - a.version)) {
          console.log(`    V${entry.version}: ${entry.docxPath ? 'DOCX' : ''} ${entry.pdfPath ? 'PDF' : ''}`);
        }
      }
      
      const artifactGuj = await artifacts.findOne({ identifier: sopCode, language: 'Gujarati' });
      if (artifactGuj) {
        console.log(`  Gujarati Artifacts (MIGRATED):`);
        for (const entry of artifactGuj.entries.sort((a,b) => b.version - a.version)) {
          console.log(`    V${entry.version}: ${entry.docxPath ? 'DOCX' : ''} ${entry.pdfPath ? 'PDF' : ''}`);
        }
      } else {
        console.log(`  Gujarati Artifacts: NONE`);
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

analyzeVersions();
