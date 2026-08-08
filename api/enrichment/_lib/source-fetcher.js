/**
 * Server-side official source fetcher with SSRF protection and bounded reads.
 */

const crypto = require('crypto');
const { assertSafeUrl } = require('./source-fetch-security');
const { extractPageContent, isCloudflareChallenge } = require('./html-text-extractor');

const FETCH_TIMEOUT_MS = Number(process.env.SOURCE_FETCH_TIMEOUT_MS || 10000);
const MAX_RESPONSE_BYTES = Number(process.env.SOURCE_FETCH_MAX_BYTES || 512 * 1024);
const MAX_REDIRECTS = 3;
const USER_AGENT =
  'Mozilla/5.0 (compatible; FamilyPilot/1.0; +https://family-pilot-seven.vercel.app; enrichment-research)';

async function readBoundedHtml(response, maxBytes) {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    const truncated = buffer.byteLength > maxBytes;
    const slice = truncated ? buffer.slice(0, maxBytes) : buffer;
    return {
      html: Buffer.from(slice).toString('utf8'),
      bytes: slice.byteLength,
      truncated,
    };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const remaining = maxBytes - total;
      if (value.length > remaining) {
        chunks.push(value.slice(0, remaining));
        total += remaining;
        truncated = true;
        await reader.cancel();
        break;
      }

      chunks.push(value);
      total += value.length;

      if (total >= maxBytes) {
        const peek = await reader.read();
        if (!peek.done) {
          truncated = true;
          await reader.cancel();
        }
        break;
      }
    }
  } catch {
    // fall through with partial content
    truncated = true;
  }

  return {
    html: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8'),
    bytes: total,
    truncated,
  };
}

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
      const { html } = await readBoundedHtml(response, 64 * 1024);
      if (html && isCloudflareChallenge(html)) {
        return { status: 'blocked', html, finalUrl: parsed.toString(), error: 'cloudflare_challenge' };
      }
      return { status: 'blocked', html: null, error: `HTTP ${response.status}` };
    }

    if (response.status === 404) {
      return { status: 'error', html: null, error: 'HTTP 404', httpStatus: 404 };
    }

    if (!response.ok) {
      return { status: 'error', html: null, error: `HTTP ${response.status}`, httpStatus: response.status };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return { status: 'non_html', html: null, contentType };
    }

    const contentLength = Number(response.headers.get('content-length'));
    const { html, bytes, truncated } = await readBoundedHtml(response, MAX_RESPONSE_BYTES);

    if (!html || html.length < 50) {
      return { status: 'too_large_unusable', html: null, bytes: contentLength || bytes, error: 'empty_or_unusable' };
    }

    if (isCloudflareChallenge(html)) {
      return { status: 'blocked', html, finalUrl: parsed.toString(), error: 'cloudflare_challenge' };
    }

    if (truncated) {
      return {
        status: 'fetched_truncated',
        html,
        finalUrl: parsed.toString(),
        bytes,
        truncated: true,
      };
    }

    return { status: 'ok', html, finalUrl: parsed.toString(), bytes };
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
  const usable =
    (result.status === 'ok' || result.status === 'fetched_truncated') && result.html;

  if (!usable) {
    return {
      ok: false,
      fetchStatus: result.status,
      error: result.error ?? result.status,
      url: urlString,
      html: result.html ?? null,
      truncated: result.truncated ?? false,
    };
  }

  const { title, text } = extractPageContent(result.html);
  const contentHash = crypto.createHash('sha256').update(text).digest('hex');

  return {
    ok: true,
    fetchStatus: result.status,
    url: result.finalUrl ?? urlString,
    pageTitle: title,
    extractedText: text,
    contentHash,
    html: result.html,
    retrievedAt: new Date().toISOString(),
    truncated: result.truncated ?? false,
    bytesRead: result.bytes ?? result.html.length,
  };
}

function hashContent(text) {
  return crypto.createHash('sha256').update(text || '').digest('hex');
}

module.exports = {
  fetchOfficialPage,
  fetchWithRedirects,
  readBoundedHtml,
  hashContent,
  MAX_RESPONSE_BYTES,
  FETCH_TIMEOUT_MS,
};
