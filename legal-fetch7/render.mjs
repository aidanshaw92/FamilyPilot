// One-off: render the OS OpenData licence and acknowledgement pages and print the lines that name the licence and the required wording. GET only.
import { chromium } from 'playwright';

const UA = 'FamilyPilot-licence-review/1.0 (+https://github.com/aidanshaw92/FamilyPilot)';
const PAGES = [
  'http://os.uk/opendata/licence',
  'https://www.os.uk/opendata/licence',
  'https://osdatahub.os.uk/legal/openDataLicence',
  'https://www.ordnancesurvey.co.uk/business-government/licensing-agreements/copyright-acknowledgements',
  'https://www.ordnancesurvey.co.uk/products/os-open-greenspace',
];
const WANT = /attribution|acknowledg|crown copyright|database right|open government licen|OS OpenData|contains (os|ordnance survey) data|ogl|licen[cs]e/i;

const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: UA, locale: 'en-GB' });
for (const url of PAGES) {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);
    const text = await page.evaluate(() => (document.querySelector('main') ?? document.body).innerText);
    const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const hits = lines.filter((l) => WANT.test(l));
    console.log(`\n===== BEGIN ${url}\nstatus ${res?.status()} final ${page.url()} title "${await page.title()}" lines ${lines.length}`);
    console.log(hits.slice(0, 60).map((l) => `  ${l.slice(0, 400)}`).join('\n'));
    console.log('===== END');
  } catch (e) {
    console.log(`\n===== ${url}\nERROR ${String(e).slice(0, 300)}`);
  }
  await page.close();
  await new Promise((r) => setTimeout(r, 1500));
}
await browser.close();
console.log('DONE');
