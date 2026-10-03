// Read-only deployment checks; requires Node.js and curl. No tokens are read.
// Optional args override DNS before a cutover: node deploy/check-lab-ingress.mjs IP IP
import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { isIP, createConnection } from 'node:net';

const marketing = 'zellige.lab.kzzazzk.tech';
const pilot = 'zellige-dev.lab.kzzazzk.tech';
const marketingIP = process.argv[2] ?? (await lookup(marketing, { family: 4 })).address;
const pilotIP = process.argv[3] ?? (await lookup(pilot, { family: 4 })).address;
if (isIP(marketingIP) !== 4 || isIP(pilotIP) !== 4 || marketingIP === pilotIP) {
  throw new Error('Expected two distinct IPv4 addresses for the private ingress nodes');
}

const cases = [
  { name: 'marketing HTTPS', domain: marketing, ip: marketingIP, status: 200, title: true },
  { name: 'pilot HTTPS', domain: pilot, ip: pilotIP, status: 200, title: true },
  { name: 'pilot health', domain: pilot, ip: pilotIP, path: '/health', status: 200 },
  { name: 'pilot rejects missing bearer', domain: pilot, ip: pilotIP, path: '/v1/conversations', status: 401 },
  { name: 'marketing has no API', domain: marketing, ip: marketingIP, path: '/v1/conversations', status: 404 },
  { name: 'marketing rejects pilot hostname', domain: pilot, ip: marketingIP, status: 404 },
  { name: 'pilot rejects marketing hostname', domain: marketing, ip: pilotIP, status: 404 },
  { name: 'marketing rejects unrelated SNI/Host', domain: 'engram.lab.kzzazzk.tech', ip: marketingIP, status: 404 },
  { name: 'pilot rejects unrelated SNI/Host', domain: 'engram.lab.kzzazzk.tech', ip: pilotIP, status: 404 },
  { name: 'marketing rejects spoofed Host', domain: marketing, ip: marketingIP, host: 'engram.lab.kzzazzk.tech', status: 404 },
  { name: 'pilot rejects spoofed Host', domain: pilot, ip: pilotIP, host: 'engram.lab.kzzazzk.tech', status: 404 },
];

function checkHTTP(test) {
  return new Promise((resolve, reject) => {
    const args = ['--noproxy', '*', '--resolve', `${test.domain}:443:${test.ip}`,
      '--silent', '--show-error', '--max-time', '10', '--write-out', '\n%{http_code}',
      ...(test.host ? ['--header', `Host: ${test.host}`] : []),
      `https://${test.domain}${test.path ?? '/'}`];
    const process = spawn('curl', args);
    let body = '';
    let error = '';
    process.stdout.on('data', chunk => { body += chunk; });
    process.stderr.on('data', chunk => { error += chunk; });
    process.on('error', reject);
    process.on('close', code => {
      const status = Number(body.slice(body.lastIndexOf('\n') + 1));
      const ok = code === 0 && status === test.status && (!test.title || /<title>Zellige/.test(body));
      console.log(`${ok ? 'PASS' : 'FAIL'} ${test.name}: HTTP ${status}`);
      if (!ok && error) console.error(error.trim());
      resolve(ok);
    });
  });
}

function checkNoSSH(ip) {
  return new Promise(resolve => {
    const socket = createConnection({ host: ip, port: 22 });
    let finished = false;
    let connected = false;
    function finish(ok) {
      if (finished) return;
      finished = true;
      socket.destroy();
      console.log(`${ok ? 'PASS' : 'FAIL'} ${ip}:22 ${ok ? 'refused/closed without SSH' : 'unexpected open service'}`);
      resolve(ok);
    }
    // Userspace networking may finish the TCP handshake before the backend
    // dial fails. Check refusal/closure or data, not the connect event alone.
    socket.setTimeout(2500, () => finish(!connected));
    socket.once('error', () => finish(true));
    socket.once('connect', () => { connected = true; });
    socket.once('data', () => finish(false));
    socket.once('end', () => finish(true));
    socket.once('close', () => finish(true));
  });
}

const results = await Promise.all([
  ...cases.map(checkHTTP), checkNoSSH(marketingIP), checkNoSSH(pilotIP),
]);
if (results.some(ok => !ok)) process.exitCode = 1;
else console.log('All 13 ingress checks passed. These probes use this machine, not the collaborator account.');
