import mongoose from 'mongoose';
import connectDB from './src/lib/mongodb';
import SOP from './src/models/SOP';
import SOPLibrary from './src/models/SOPLibrary';
import MasterSOPRepository from './src/models/MasterSOPRepository';

async function run() {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    const qcId = 'QCGE05-00';
    const praaId = 'PRAA05-05';

    console.log('\n--- Checking QCGE05-00 ---');
    const qcSops = await SOP.find({ identifier: { $regex: /QCGE05/i } });
    console.log('SOP Records:', qcSops.length);
    qcSops.forEach(s => console.log(`  - ID: ${s.identifier}, Lang: ${s.language}, File: ${s.fileUrl}, Type: ${s.fileType}`));

    const qcLib = await SOPLibrary.find({ sopIdentifier: { $regex: /QCGE05/i } });
    console.log('Library Records:', qcLib.length);
    qcLib.forEach(l => {
        console.log(`  - Identifier: ${l.sopIdentifier}, Name: ${l.sopName}`);
        console.log(`    SOP Docs:`, l.sopDocuments.map(d => d.filePath));
    });

    console.log('\n--- Checking PRAA05-05 ---');
    const prSops = await SOP.find({ identifier: { $regex: /PRAA05/i } });
    console.log('SOP Records:', prSops.length);
    prSops.forEach(s => console.log(`  - ID: ${s.identifier}, Name: ${s.name}, Lang: ${s.language}`));

    const prLib = await SOPLibrary.find({ sopIdentifier: { $regex: /PRAA05/i } });
    console.log('Library Records:', prLib.length);
    prLib.forEach(l => console.log(`  - Identifier: ${l.sopIdentifier}, Name: ${l.sopName}`));
    
    const prMaster = await MasterSOPRepository.find({ sopIdentifier: { $regex: /PRAA05/i } });
    console.log('Master Records:', prMaster.length);
    prMaster.forEach(m => console.log(`  - Identifier: ${m.sopIdentifier}, Name: ${m.sopName}`));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
