import http from 'node:http';
// Mirrors the hosted layout (the Supabase gateway adds CORS): https://<ref>.supabase.co/auth/v1/* -> the auth server's /*
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': '*' };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const path = req.url.replace(/^\/auth\/v1/, '') || '/';
  const up = http.request({ host: '127.0.0.1', port: 9999, path, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, { ...r.headers, ...cors }); r.pipe(res); });
  up.on('error', (e) => { res.writeHead(502, cors); res.end(String(e)); });
  req.pipe(up);
}).listen(9998, '127.0.0.1');
