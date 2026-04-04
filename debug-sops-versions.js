const mongoose = require('mongoose');

async function run() {
  const uri = "mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/test?retryWrites=true&w=majority";
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  
  const SopSchema = new mongoose.Schema({}, { strict: false });
  const SOP = mongoose.model('SOP', SopSchema, 'sops');
  
  const productionSops = await SOP.find({
    department: { $regex: /Production/i }
  }).lean();
  
  console.log(`Production SOPs: ${productionSops.length}`);
  const families = new Map();
  productionSops.forEach(s => {
    const id = s.identifier;
    const match = id.match(/^(.*?)-(\d+)$/);
    if (match) {
      const family = match[1];
      const rev = parseInt(match[2], 10);
      if (!families.has(family)) families.set(family, []);
      families.get(family).push(rev);
    }
  });
  
  console.log("Families summary:");
  for (const [f, revs] of families.entries()) {
    console.log(`- ${f}: [${revs.sort((a,b)=>a-b).join(', ')}]`);
  }
  
  await mongoose.disconnect();
}

run().catch(console.error);
