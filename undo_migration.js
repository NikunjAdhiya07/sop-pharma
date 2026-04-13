const mongoose = require('mongoose');

async function undoMigration() {
  try {
    const uri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';
    await mongoose.connect(uri);
    
    const db = mongoose.connection.db;
    const artifacts = db.collection('sopversionartifacts');
    
    // Find all Gujarati artifacts and check if they were migrated (have base codes like MAGE01)
    const gujaratiArtifacts = await artifacts.find({ language: 'Gujarati' }).toArray();
    
    console.log(`\n🔄 Removing ${gujaratiArtifacts.length} migrated Gujarati artifacts...\n`);
    
    for (const artifact of gujaratiArtifacts) {
      // Check if this looks like a migrated entry (base code without suffix)
      if (/^[A-Z]{4}\d{2}$/.test(artifact.identifier)) {
        console.log(`  Removing: ${artifact.identifier}::Gujarati`);
        await artifacts.deleteOne({ _id: artifact._id });
      }
    }
    
    console.log('\n✅ Migration undone!');
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

undoMigration();
