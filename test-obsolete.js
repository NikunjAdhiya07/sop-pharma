const fetch = require('node-fetch');

async function testObsoleteAPI() {
  try {
    const res = await fetch('http://localhost:3000/api/sop/obsolete-list');
    const data = await res.json();
    console.log('Obsolete List API Response:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testObsoleteAPI();
