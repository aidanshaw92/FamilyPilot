/**
 * Server-side official source fetcher with SSRF protection and size limits.
 */

const crypto = require('crypto');
const { assertSafeUrl } = require('./source-fetch-security');
const { extractPageContent, isCloudflareChallenge } = require('./html-text-extractor');

const FETCH_TIMEOUT_MS = Number(process.env.SOURCE_FETCH_TIMEOUT_MS || 10000);
const MAX_RESPONSE_BYTES = Number(process.env.SOURCE_FETCH_MAX_BYTES || 512 * 1024);
const MAX_REDIRECTS = 3;
const USER_AGENT =
  'Mozilla/5.0 (compatible; FamilyPilot/1.0; +https://family-pilot-seven.vercel.app; enrichment-research)';

async function fetchWithRedirects(urlString, redirectCount = 0) {
  const parsed = await assertSafeUrl(urlString);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      redirect: 'manual',
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without location');
      if (redirectCount >= MAX_REDIRECTS) throw new Error('Too many redirects');
      const nextUrl = new URL(location, parsed.toString()).toString();
      return fetchWithRedirects(nextUrl, redirectCount + 1);
    }

    if (response.status === 403 || response.status === 401) {
      const buffer = await response.arrayBuffer();
      const html = Buffer.from(buffer).toString('utf8');
      if (isCloudflareChallenge(html)) {
        return { status: 'blocked', html, finalUrl: parsed.toString(), error: 'cloudflare_challenge' };
      }
      return { status: 'blocked', html: null, error: `HTTP ${response.status}` };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return { status: 'non_html', html: null, contentType };
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      return { status: 'too_large', html: null, bytes: buffer.byteLength };
    }

    const html = Buffer.from(buffer).toString('utf8');
    if (isCloudflareChallenge(html)) {
      return { status: 'blocked', html, finalUrl: parsed.toString(), error: 'cloudflare_challenge' };
    }

    return { status: 'ok', html, finalUrl: parsed.toString(), bytes: buffer.byteLength };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 'timeout', html: null, error: 'Fetch timeout' };
    }
    return {
      status: 'error',
      html: null,
      error: error instanceof Error ? error.message : 'Fetch failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOfficialPage(urlString) {
  const result = await fetchWithRedirects(urlString);
  if (result.status !== 'ok' || !result.html) {
    return {
      ok: false,
      fetchStatus: result.status,
      error: result.error ?? result.status,
      url: urlString,
      html: result.html ?? null,
    };
  }

  const { title, text } = extractPageContent(result.html);
  const contentHash = crypto.createHash('sha256').update(text).digest('hex');

  return {
    ok: true,
    fetchStatus: 'ok',
    url: result.finalUrl ?? urlString,
    pageTitle: title,
    extractedText: text,
    contentHash,
    html: result.html,
    retrievedAt: new Date().toISOString(),
  };
}

function hashContent(text) {
  return crypto.createHash('sha256').update(text || '').digest('hex');
}

module.exports = {
  fetchOfficialPage,
  fetchWithRedirects,
  hashContent,
  MAX_RESPONSE_BYTES,
  FETCH_TIMEOUT_MS,
};
