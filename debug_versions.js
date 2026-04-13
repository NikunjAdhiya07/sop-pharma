const mongoose = require('mongoose');

async function debugVersions() {
  try {
    const uri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';
    await mongoose.connect(uri);
    
    const db = mongoose.connection.db;
    const sops = db.collection('sops');
    const artifacts = db.collection('sopversionartifacts');
    
    // Check what's in each collection for MAGE02
    console.log('\n📊 MAGE02 Analysis:\n');
    
    // In SOP collection
    const mage02SOPs = await sops.find({ identifier: /^MAGE02/ }).toArray();
    console.log('SOP Collection (MAGE02*):\n');
    for (const sop of mage02SOPs.sort((a, b) => a.identifier.localeCompare(b.identifier))) {
      console.log(`  ${sop.identifier} | ${sop.language} | V${sop.version || '?'} | ${sop.fileType}`);
    }
    
    // In SOPVersionArtifacts
    console.log('\nSOPVersionArtifacts (MAGE02):\n');
    const artifacts02 = await artifacts.find({ identifier: 'MAGE02' }).toArray();
    for (const artifact of artifacts02) {
      console.log(`  Language: ${artifact.language}`);
      for (const entry of artifact.entries.sort((a, b) => b.version - a.version)) {
        const hasDocx = entry.docxPath ? '✓' : '✗';
        const hasPdf = entry.pdfPath ? '✓' : '✗';
        console.log(`    V${entry.version}: DOCX${hasDocx} PDF${hasPdf}`);
        if (entry.docxPath) console.log(`       Path: ${entry.docxPath.substring(0, 80)}...`);
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

debugVersions();
