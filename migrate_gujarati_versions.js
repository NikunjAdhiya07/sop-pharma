const mongoose = require('mongoose');

async function migrateGujaratiVersions() {
  try {
    const uri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';
    await mongoose.connect(uri);
    
    const db = mongoose.connection.db;
    const sops = db.collection('sops');
    const artifacts = db.collection('sopversionartifacts');
    
    // Find Gujarati SOPs that are supersede versions (like MAGE01-08, MAGE02-06)
    const gujaratiSOPs = await sops.find({
      language: 'Gujarati',
      identifier: { $regex: /^(MAGE|PEGE|QAGE|BSGE|AAGE|CAGE|DAGE|EAGE|FAGE|GAGE|HAGE|IAGE|JAGE|KAGE|LAGE)\d{2}-\d+$/ }
    }).toArray();
    
    console.log(`\n🔄 Found ${gujaratiSOPs.length} Gujarati SOP records to migrate\n`);
    
    for (const sop of gujaratiSOPs) {
      const sopId = sop.identifier;
      // Extract base code (e.g., MAGE01 from MAGE01-08)
      const match = sopId.match(/^([A-Z]{4}\d{2})-(\d+)$/);
      if (!match) continue;
      
      const baseCode = match[1];  // e.g., MAGE01
      const rev = parseInt(match[2], 10); // e.g., 8
      
      const fileType = sop.fileType || 'docx';
      const filePath = sop.fileUrl;
      
      if (!filePath) {
        console.log(`⚠️  ${sopId}: No fileUrl, skipping`);
        continue;
      }
      
      // Create or update SOPVersionArtifacts entry for the base code
      const updateResult = await artifacts.updateOne(
        { identifier: baseCode, language: 'Gujarati' },
        {
          $set: { language: 'Gujarati' },
          $addToSet: {
            entries: {
              version: rev,
              ...(fileType === 'docx' && { docxPath: filePath }),
              ...(fileType === 'pdf' && { pdfPath: filePath })
            }
          }
        },
        { upsert: true }
      );
      
      console.log(`✅ ${sopId} → ${baseCode}::Gujarati::V${rev}`);
    }
    
    console.log('\n✨ Migration complete!');
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

migrateGujaratiVersions();
