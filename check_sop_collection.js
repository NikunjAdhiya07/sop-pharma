const mongoose = require('mongoose');

async function checkSOPs() {
  try {
    const uri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';
    await mongoose.connect(uri);
    
    const db = mongoose.connection.db;
    const sops = db.collection('sops');
    
    // Find all MAGE0X SOPs
    const docs = await sops.find({
      identifier: { $regex: /^MAGE0[1248]/ }
    }).project({
      identifier: 1,
      language: 1,
      fileType: 1,
      fileUrl: 1,
      version: 1
    }).toArray();
    
    console.log(`\n📚 Found ${docs.length} SOPs in SOP collection for MAGE SOPs:\n`);
    
    const grouped = {};
    for (const doc of docs) {
      if (!grouped[doc.identifier]) grouped[doc.identifier] = [];
      grouped[doc.identifier].push({
        language: doc.language,
        fileType: doc.fileType,
        version: doc.version,
        fileUrl: doc.fileUrl?.substring(0, 60) + '...'
      });
    }
    
    for (const [sop, versions] of Object.entries(grouped).sort()) {
      console.log(`\nSOP: ${sop}`);
      for (const v of versions.sort((a, b) => (a.version || 0) - (b.version || 0))) {
        console.log(`  ${v.language} | V${v.version || '?'} | ${v.fileType} | ${v.fileUrl}`);
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkSOPs();
