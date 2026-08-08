/**
 * SSRF-safe URL validation for official source fetching.
 */

const { lookup } = require('dns/promises');
const { isIP } = require('net');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
]);

function isPrivateIp(ip) {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80')) return true;
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function validateUrlString(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs allowed');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error('Blocked hostname');
  }
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Blocked internal hostname');
  }
  const ipVersion = isIP(hostname);
  if (ipVersion && isPrivateIp(hostname)) {
    throw new Error('Blocked private IP');
  }
  return parsed;
}

async function resolveAndValidateHost(hostname) {
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Blocked private IP');
    return;
  }
  const records = await lookup(hostname, { all: true });
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error('Hostname resolves to private IP');
    }
  }
}

async function assertSafeUrl(urlString) {
  const parsed = validateUrlString(urlString);
  await resolveAndValidateHost(parsed.hostname);
  return parsed;
}

module.exports = {
  assertSafeUrl,
  validateUrlString,
  isPrivateIp,
};
