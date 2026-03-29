import mongoose from 'mongoose';
const uri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';
mongoose.connect(uri).then(async () => {
  const db = mongoose.connection.db;
  const sops = await db.collection('sops').find({}).project({identifier:1, name:1}).toArray();
  console.log('Total SOPs', sops.length);
  for(let s of sops) {
    const id = (s.identifier||'').trim();
    if(!id) continue;
    
    // same regex as cleanSopName
    const escaped = id.replace(/[-]/g, '[-_]?');
    const re = new RegExp(`^${escaped}[\\s_\\-–—:,]*`, 'i');
    
    const t = Date.now();
    re.test(s.name || '');
    if(Date.now() - t > 5) {
      console.log('SLOW REGEX on cleanSopName:', id, 'TIME:', Date.now() - t, 'ms');
    }
  }

  console.log('Done test 1');

  // Let's also test looseRevPrefix regex from cleanSopName
  for (let s of sops) {
    const idUpper = (s.identifier||'').trim().toUpperCase();
    const idNorm = idUpper; // mock
    const famM = idNorm.match(/^([A-Z]{2,6})(\d+)-(\d+)$/);
    if (famM) {
      const letters = famM[1];
      const docNum = parseInt(famM[2], 10);
      const looseRevPrefix = new RegExp(
        `^${letters}0*${docNum}-\\d+[\\s_\\-–—:,]*`,
        'i',
      );
      const t = Date.now();
      looseRevPrefix.test(s.name || '');
      if (Date.now() - t > 5) {
        console.log('SLOW REGEX on looseRevPrefix:', idUpper);
      }
    }
  }

  console.log('Done test 2');
  process.exit(0);
});
