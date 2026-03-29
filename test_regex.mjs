import mongoose from 'mongoose';
const uri = 'mongodb+srv://nikunjadhiya32:sharpux@cluster0.rop3mr6.mongodb.net/';
mongoose.connect(uri).then(async () => {
  const db = mongoose.connection.db;
  console.time('fetch');
  const sops = await db.collection('sops').find({name: {$not: /annexure/i}}).project({identifier:1, name:1, content:1}).toArray();
  console.timeEnd('fetch');

  let totalContentLength = 0;
  for (let s of sops) {
    if (s.content) totalContentLength += s.content.length;
  }
  console.log('Total chars in content:', totalContentLength, 'in', sops.length, 'SOPs');

  console.time('regex-guj');
  let gl=0;
  for(let s of sops) {
    const c=s.content || '';
    const m1=c.match(/[\u0A80-\u0AFF]/g);
    if(m1) gl+=m1.length;
  }
  console.timeEnd('regex-guj');

  console.time('regex-latin');
  let ll=0;
  for(let s of sops) {
    const c=s.content || '';
    const m2=c.match(/[A-Za-z]/g);
    if(m2) ll+=m2.length;
  }
  console.timeEnd('regex-latin');

  console.log('Guj chars:', gl, 'Latin:', ll);
  process.exit(0);
});
