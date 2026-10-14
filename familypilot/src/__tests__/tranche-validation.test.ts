import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The checks a tranche must pass before a person is asked to sign it: every entry is the open source's own record (fidelity), nothing from Google reached it
 * (independence), and the things a reviewer should not have to find by eye are found (hygiene, duplicates). Synthetic fixtures only; no Google value.
 */
const root = join(__dirname, '../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let checks: any;
async function load() { checks ??= await import(join(root, 'scripts/lib/tranche-checks.mjs')); }

const guid = (label: string) => {
  const h = Buffer.from(label).toString('hex').padEnd(32, '0').slice(0, 32).toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
function square(lat: number, lng: number, side: number) {
  const dLat = side / 110540;
  const dLng = side / (111320 * Math.cos((lat * Math.PI) / 180));
  return { type: 'Polygon', coordinates: [[[lng, lat], [lng + dLng, lat], [lng + dLng, lat + dLat], [lng, lat + dLat], [lng, lat]]] };
}
const greenspace = { features: [{ type: 'Feature', properties: { id: guid('P1'), function: 'Public Park Or Garden', distName1: 'Larch Park' }, geometry: square(51.5, -0.1, 400) }] };
const row = (q: string, label: string, cls: string, coord: string, website?: string) => ({
  item: { value: `http://www.wikidata.org/entity/${q}` }, itemLabel: { value: label }, coord: { value: coord }, classLabel: { value: cls }, sitelinks: { value: '12' },
  ...(website ? { website: { value: website } } : {}),
});
const wikidata = [{ results: { bindings: [row('Q10', 'Test Museum', 'museum', 'Point(-0.12 51.52)', 'http://museum.example.org/'), row('Q11', 'Test School Museum', 'museum', 'Point(-0.13 51.53)')] } }];

const osEntry = (checksLib: { sourceIndex: unknown }, index: { os: Map<string, { lat: number; lng: number }> }, over: Record<string, unknown> = {}) => {
  const p = [...index.os.values()][0];
  return {
    familypilotId: `fp-os-${guid('P1').toLowerCase()}`, name: 'Larch Park', category: 'park',
    identity: { source: 'os-greenspace', url: 'https://www.ordnancesurvey.co.uk/products/os-open-greenspace', retrievedAt: '2026-10-14', licence: 'OGL-3.0', externalId: guid('P1').toLowerCase() },
    location: { latitude: p.lat, longitude: p.lng, source: 'os-greenspace', licence: 'OGL-3.0' },
    reviewedBy: 'UNREVIEWED (simulation only)', reviewedAt: '2026-10-14', ...over,
  };
};
const wdEntry = (over: Record<string, unknown> = {}) => ({
  familypilotId: 'fp-wd-q10', name: 'Test Museum', category: 'museum',
  identity: { source: 'wikidata', url: 'https://www.wikidata.org/wiki/Q10', retrievedAt: '2026-10-14', licence: 'CC0-1.0', externalId: 'Q10' },
  location: { latitude: 51.52, longitude: -0.12, source: 'wikidata', licence: 'CC0-1.0' },
  website: 'https://museum.example.org/', reviewedBy: 'UNREVIEWED (simulation only)', reviewedAt: '2026-10-14', ...over,
});

async function setup() {
  await load();
  const index = checks.sourceIndex({ greenspace, wikidata });
  return { index, os: osEntry(checks, index) };
}

describe('fidelity: the entry is the source record, not a copy of anything else', () => {
  it('passes entries that are exactly their source record', async () => {
    const { index, os } = await setup();
    expect(checks.fidelityProblems(os, index)).toEqual([]);
    expect(checks.fidelityProblems(wdEntry(), index)).toEqual([]);
  });

  it('fails a changed name, a moved position, a changed category, a website the source does not list, and a record the extract does not hold', async () => {
    const { index, os } = await setup();
    expect(checks.fidelityProblems({ ...os, name: 'Larch Park Gardens' }, index).join()).toMatch(/name differs/);
    expect(checks.fidelityProblems({ ...os, location: { ...os.location, latitude: os.location.latitude + 0.0003 } }, index).join()).toMatch(/interior point/);
    expect(checks.fidelityProblems(wdEntry({ category: 'attraction' }), index).join()).toMatch(/category differs/);
    expect(checks.fidelityProblems(wdEntry({ website: 'https://other.example.org/' }), index).join()).toMatch(/website/);
    expect(checks.fidelityProblems(wdEntry({ identity: { ...wdEntry().identity, externalId: 'Q99' } }), index).join()).toMatch(/not found/);
    expect(checks.fidelityProblems({ ...os, website: 'https://larch.example.org/' }, index).join()).toMatch(/no website/);
  });

  it('takes Wikidata\'s http website as the https one the entry carries, and nothing else', async () => {
    const { index } = await setup();
    expect(checks.fidelityProblems(wdEntry({ website: 'https://museum.example.org/' }), index)).toEqual([]);
    expect(checks.fidelityProblems(wdEntry({ website: 'https://museum.example.org/x' }), index).join()).toMatch(/website/);
  });
});

describe('independence: nothing from Google reached the entry', () => {
  const stored = [{ id: 'fp-google-ChIJabcdefghij1234', name: 'Test Museum', lat: '51.52', lng: '-0.12' }];

  it('passes a clean entry', async () => {
    await load();
    expect(checks.independenceProblems(wdEntry({ location: { latitude: 51.520123, longitude: -0.120456, source: 'wikidata', licence: 'CC0-1.0' } }), stored)).toEqual([]);
  });

  it('fails a Google marker anywhere in the entry, whether a URL or a place id', async () => {
    await load();
    expect(checks.independenceProblems(wdEntry({ website: 'https://maps.google.com/?cid=1' }), [])).toHaveLength(1);
    expect(checks.independenceProblems(wdEntry({ name: 'Test Museum ChIJabcdefghij1234' }), [])[0]).toMatch(/Google marker/);
  });

  it('fails a stored Google place id that appears in the entry, even in a form the marker would miss', async () => {
    await load();
    const sneaky = wdEntry({ identity: { ...wdEntry().identity, externalId: 'abcdefghij1234' } });
    expect(checks.independenceProblems({ ...sneaky, familypilotId: 'fp-wd-ChIJabcdefghij1234' }, stored).join()).toMatch(/Google/);
    const stored2 = [{ id: 'fp-google-abcdefghij1234', lat: '1', lng: '1' }];
    expect(checks.independenceProblems(sneaky, stored2).join()).toMatch(/stored Google place id/);
  });

  it('fails a position given to the stored rows\' four places and equal to one, but not one given to six places that merely rounds to it', async () => {
    await load();
    const copied = wdEntry({ location: { latitude: 51.52, longitude: -0.12, source: 'wikidata', licence: 'CC0-1.0' } });
    expect(checks.independenceProblems(copied, stored).join()).toMatch(/stored Google row/);
    const own = wdEntry({ location: { latitude: 51.520031, longitude: -0.119977, source: 'wikidata', licence: 'CC0-1.0' } });
    expect(checks.independenceProblems(own, stored)).toEqual([]);
  });
});

describe('hygiene and the batch', () => {
  it('finds an out-of-scope place, a club, a generic name and a website that is not https', async () => {
    await load();
    expect(checks.hygieneProblems(wdEntry({ location: { latitude: 52.5, longitude: -1.9, source: 'wikidata', licence: 'CC0-1.0' } })).join()).toMatch(/scope/);
    expect(checks.hygieneProblems(wdEntry({ name: 'Larch Cricket Club' })).join()).toMatch(/club/);
    expect(checks.hygieneProblems(wdEntry({ name: 'Gardens' })).join()).toMatch(/generic/);
    expect(checks.hygieneProblems(wdEntry({ website: 'http://museum.example.org/' })).join()).toMatch(/https/);
    expect(checks.hygieneProblems(wdEntry())).toEqual([]);
  });

  it('finds one source record twice and two entries for one place', async () => {
    const { os } = await setup();
    const twin = { ...os, familypilotId: 'fp-os-another' };
    const out = checks.batchProblems([os, twin]);
    expect(out.get('fp-os-another').join()).toMatch(/same source record/);
    const near = wdEntry({ familypilotId: 'fp-wd-q77', identity: { ...wdEntry().identity, externalId: 'Q77' } });
    expect(checks.batchProblems([wdEntry(), near]).get('fp-wd-q77').join()).toMatch(/same name within/);
  });
});

describe('a whole tranche', () => {
  it('counts what passes, lists what fails and why, and lets a person accept a hygiene rule but never a source or independence failure', async () => {
    const { index, os } = await setup();
    const club = wdEntry({ familypilotId: 'fp-wd-q11', name: 'Test School Museum', identity: { ...wdEntry().identity, externalId: 'Q11', url: 'https://www.wikidata.org/wiki/Q11' }, location: { latitude: 51.53, longitude: -0.13, source: 'wikidata', licence: 'CC0-1.0' } });
    delete (club as { website?: string }).website;
    const renamed = { ...os, familypilotId: 'fp-os-renamed', name: 'Elm Park', identity: { ...os.identity, externalId: guid('P1').toLowerCase() } };
    const r = checks.validateTranche([os, wdEntry(), club, renamed], { index });
    expect(r.total).toBe(4);
    expect(r.passed).toBe(2);
    expect(r.failed.map((f: { id: string }) => f.id).sort()).toEqual(['fp-os-renamed', 'fp-wd-q11']);
    const accepted = checks.validateTranche([os, wdEntry(), club, renamed], { index, allow: { 'fp-wd-q11': 'a museum that happens to be named for a school', 'fp-os-renamed': 'trying to hide a mismatch' } });
    expect(accepted.accepted.map((f: { id: string }) => f.id)).toEqual(['fp-wd-q11']);
    expect(accepted.failed.map((f: { id: string }) => f.id)).toEqual(['fp-os-renamed']);
  });
});
