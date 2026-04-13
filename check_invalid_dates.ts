
import mongoose from 'mongoose';
import connectDB from './src/lib/mongodb';
import SOP from './src/models/SOP';
import MasterSOPRepository from './src/models/MasterSOPRepository';

async function checkDates() {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    const sops = await SOP.find({}, 'identifier reviewDate expiryDate name').lean();
    console.log(`Checking ${sops.length} SOPs...`);
    for (const sop of sops) {
      if (sop.reviewDate) {
        const d = new Date(sop.reviewDate);
        if (isNaN(d.getTime())) {
          console.error(`Invalid reviewDate for SOP ${sop.identifier}: "${sop.reviewDate}" (Name: ${sop.name})`);
        }
      }
      if (sop.expiryDate) {
        const d = new Date(sop.expiryDate);
        if (isNaN(d.getTime())) {
          console.error(`Invalid expiryDate for SOP ${sop.identifier}: "${sop.expiryDate}" (Name: ${sop.name})`);
        }
      }
    }

    const masters = await MasterSOPRepository.find({}, 'sopIdentifier metadata.reviewDate metadata.expiryDate').lean();
    console.log(`Checking ${masters.length} MasterSOPs...`);
    for (const m of masters) {
      const rd = m.metadata?.reviewDate;
      const ed = m.metadata?.expiryDate;
      if (rd) {
        const d = new Date(rd);
        if (isNaN(d.getTime())) {
          console.error(`Invalid Master reviewDate for ${m.sopIdentifier}: "${rd}"`);
        }
      }
      if (ed) {
        const d = new Date(ed);
        if (isNaN(d.getTime())) {
          console.error(`Invalid Master expiryDate for ${m.sopIdentifier}: "${ed}"`);
        }
      }
    }

    console.log('Done checking dates.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkDates();
