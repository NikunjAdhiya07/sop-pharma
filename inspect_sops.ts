import mongoose from 'mongoose';
import connectDB from './src/lib/mongodb';
import SOP from './src/models/SOP';
import SOPLibrary from './src/models/SOPLibrary';
import MasterSOPRepository from './src/models/MasterSOPRepository';

async function run() {
  try {
    await connectDB();
    
    console.log('--- SOP SEARCH ---');
    const sops = await SOP.find({ identifier: /QCGE05|PRAA05/i }).lean();
    console.log(JSON.stringify(sops.map(s => ({
      id: s.identifier,
      name: s.name,
      type: s.fileType,
      url: s.fileUrl,
      lang: s.language,
      obs: s.isObsolete
    })), null, 2));

    console.log('--- MasterSOPRepository SEARCH ---');
    const masters = await MasterSOPRepository.find({ sopIdentifier: /QCGE05|PRAA05/i }).lean();
    console.log(JSON.stringify(masters.map(m => ({
      id: m.sopIdentifier,
      name: m.sopName,
      eng: (m as any).englishName,
      guj: (m as any).gujaratiName
    })), null, 2));

    console.log('--- SOPLibrary SEARCH ---');
    const libs = await SOPLibrary.find({ sopIdentifier: /QCGE05|PRAA05/i }).lean();
    console.log(JSON.stringify(libs.map(l => ({
      id: l.sopIdentifier,
      name: l.sopName,
      docs: l.sopDocuments?.map((d: any) => ({ type: d.fileType, path: d.filePath, lang: d.language }))
    })), null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
