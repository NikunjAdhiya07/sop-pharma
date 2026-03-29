const http = require('http');

http.get('http://localhost:3000/api/dashboard/sops', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log(JSON.parse(data).data.filter(d => d.sopNo === 'PEGE23-02')));
});
