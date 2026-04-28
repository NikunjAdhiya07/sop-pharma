const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/sop-pharma').then(async () => {
  const db = mongoose.connection.db;
  const SOP = db.collection('sops');
  const doc = await SOP.findOne({ identifier: { $exists: true } }, { sort: { updatedAt: -1 } });
  console.log('Last updated SOP id:', doc._id, 'identifier:', doc.identifier);
  console.log('fileUrl:', doc.fileUrl);
  console.log('sopDocuments:', JSON.stringify(doc.sopDocuments, null, 2));
  process.exit(0);
});
