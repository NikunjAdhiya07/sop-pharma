const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  const SOP = db.collection('sops');
  const doc = await SOP.findOne({ identifier: { $exists: true } }, { sort: { updatedAt: -1 } });
  if (doc) {
    console.log('Last updated SOP id:', doc._id, 'identifier:', doc.identifier);
    console.log('fileUrl:', doc.fileUrl);
    console.log('sopDocuments:', JSON.stringify(doc.sopDocuments, null, 2));
  } else { console.log('No SOP found'); }
  process.exit(0);
});
