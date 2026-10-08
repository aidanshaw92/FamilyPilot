import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isCloudflareChallenge } = require('../../../server/enrichment/_lib/html-text-extractor.js');

/**
 * A bot interstitial must stay `blocked`; an ordinary page that merely carries Cloudflare's injected detection script must
 * not. The script below is the shape Cloudflare's JavaScript Detections add to normal 200 pages.
 */
const DETECTION_SCRIPT = `<script>(function(){function c(){var b=a.contentDocument||a.contentWindow.document;if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'8c1f',t:'MTcyOA=='};var a=document.createElement('script');a.nonce='';a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;a.style.display='none';document.body.appendChild(a)}})();</script>`;

const museumPage = `<html><head><title>Visit | The Museum</title></head><body><main>
  <h1>Plan your visit</h1>
  <p>The museum is open daily from 10.00 to 17.30, and entry to the permanent collection is free for everyone.</p>
  <p>Facilities: there are accessible toilets and baby changing on every floor, and step-free access via the main entrance.</p>
  <p>Our café on the ground floor serves hot and cold food. Pushchairs are welcome in all galleries, and a cloakroom is available.</p>
  <p>Families can pick up a free trail at the information desk, and the family room has books, puzzles and a quiet corner.</p>
  <p>The nearest station is a short walk away. There is no visitor parking on site; the nearest car park is on the high street.</p>
  <h2>Exhibitions</h2>
  <p>Our new exhibition explores two centuries of design, with objects from the collection shown together for the first time.</p>
  <p>Tickets for paid exhibitions can be booked online in advance; members go free and can bring a guest on weekdays.</p>
</main>${DETECTION_SCRIPT}</body></html>`;

const cloudflareInterstitial = `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>
<meta http-equiv="refresh" content="390"></head><body><div class="main-wrapper"><div class="main-content">
<h1 class="zone-name-title h1">www.example.org</h1><h2>Checking if the site connection is secure</h2>
<noscript>Enable JavaScript and cookies to continue</noscript></div></div>
<script>(function(){window._cf_chl_opt={cvId:'3',cZone:'www.example.org',cType:'managed'};var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=8c1f';document.head.appendChild(a);}());</script></body></html>`;

describe('bot interstitial detection', () => {
  // The shell threshold (600 characters of extracted text) sits far below a real page and far above an interstitial.
  it('a real page that carries the injected detection script is a page', () => {
    expect(isCloudflareChallenge(museumPage)).toBe(false);
  });

  it('a Cloudflare interstitial is still a challenge', () => {
    expect(isCloudflareChallenge(cloudflareInterstitial)).toBe(true);
  });

  it('an interstitial titled in another language is still a challenge (its challenge options give it away)', () => {
    expect(isCloudflareChallenge(cloudflareInterstitial.replace('Just a moment...', 'Einen Moment bitte...'))).toBe(true);
  });

  it('a shell with only the detection script and no text is still a challenge', () => {
    expect(isCloudflareChallenge(`<html><head><title>example.org</title></head><body>${DETECTION_SCRIPT}</body></html>`)).toBe(true);
  });

  it('the Imperva shell that Barnet serves is still a challenge', () => {
    expect(isCloudflareChallenge('<html><head><title>Pardon Our Interruption</title></head><body>To regain access, please make sure that cookies and JavaScript are enabled before reloading the page.</body></html>')).toBe(true);
  });

  it('"just a moment" in body copy is not a challenge', () => {
    const page = museumPage.replace('The nearest station is a short walk away.', 'The nearest station is just a moment away.').replace(DETECTION_SCRIPT, '');
    expect(isCloudflareChallenge(page)).toBe(false);
  });

  it('a title that says "Just a moment" is a challenge whatever the body says', () => {
    expect(isCloudflareChallenge('<html><head><title>Just a moment</title></head><body><p>x</p></body></html>')).toBe(true);
  });
});
