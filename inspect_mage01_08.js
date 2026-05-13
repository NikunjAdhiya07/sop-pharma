const mongoose = require('mongoose');

async function inspect() {
  try {
    const uri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const sops = db.collection('sops');

    console.log('\n===== Scan all SOPs for phantom-duplicate (same filePath under different language) =====\n');
    const all = await sops.find({}, { projection: { identifier: 1, sopDocuments: 1, language: 1, sopName: 1, name: 1 } }).toArray();
    const offenders = [];
    for (const r of all) {
      const docs = r.sopDocuments || [];
      if (docs.length < 2) continue;
      const byPath = new Map();
      for (const d of docs) {
        const k = String(d.filePath || '').trim().toLowerCase();
        if (!k) continue;
        if (!byPath.has(k)) byPath.set(k, []);
        byPath.get(k).push(d.language || '');
      }
      for (const [path, langs] of byPath) {
        const unique = [...new Set(langs.map(l => String(l).trim().toLowerCase()))];
        if (unique.length > 1) {
          offenders.push({ identifier: r.identifier, langs: unique, path: path.split('/').pop() });
        }
      }
    }
    console.log(`Found ${offenders.length} SOPs with phantom-duplicate filePath:\n`);
    for (const o of offenders) {
      console.log(`  ${o.identifier} — langs=[${o.langs.join(',')}] file=${o.path}`);
    }

    console.log('\n===== Try to find any real Gujarati file for MAGE01-08 (path contains MAGE01-08) =====\n');
    const possibleMatches = await sops.find({
      'sopDocuments.filePath': { $regex: 'MAGE01-08', $options: 'i' }
    }, { projection: { identifier: 1, sopDocuments: 1 } }).toArray();
    for (const m of possibleMatches) {
      for (const d of m.sopDocuments || []) {
        if (String(d.filePath || '').includes('MAGE01-08')) {
          console.log(`  ${m.identifier}: lang=${d.language || '?'} file=${d.filePath}`);
        }
      }
    }

    // Check soplibraries collection too
    console.log('\n===== soplibraries for MAGE01 =====\n');
    const libs = db.collection('soplibraries');
    const libFiles = await libs.find({
      $or: [
        { 'sopDocuments.filePath': { $regex: 'MAGE01', $options: 'i' } },
        { 'fileUrl': { $regex: 'MAGE01', $options: 'i' } },
      ]
    }).toArray();
    console.log(`Found ${libFiles.length} library rows`);
    for (const r of libFiles) {
      console.log(JSON.stringify({
        _id: r._id,
        identifier: r.identifier,
        sopIdentifier: r.sopIdentifier,
        language: r.language,
        fileUrl: r.fileUrl,
        docs: (r.sopDocuments || []).map(d => ({ lang: d.language, path: d.filePath })),
      }, null, 2));
    }

    await mongoose.disconnect();
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

inspect();
