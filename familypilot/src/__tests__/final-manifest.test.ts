import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const req = createRequire(import.meta.url);
const root = join(__dirname, '..', '..');
const key = req('../../../docs/pilot/beta/decisions/packC-scoring-key.json') as { idMap: Record<string, string>; controls: Record<string, unknown> };
const AB = join(root, '..', 'docs/pilot/beta/decisions/audit-packAB.jsonl');
const KEY = join(root, '..', 'docs/pilot/beta/decisions/packC-scoring-key.json');
const isControl = (o: string) => Boolean(key.controls[key.idMap[o]]);

/** The final manifest is only built from a Pack C session that met its quality bar, and it keeps what is unresolved visible. */
function exportFile(decisionFor: (opaque: string, i: number) => string) {
  const lines = Object.keys(key.idMap).map((o, i) => JSON.stringify({ n: i + 1, at: `2026-10-10T10:${String(i).padStart(2, '0')}:00.000Z`, reviewer: 'owner (founder)', itemId: o, decision: decisionFor(o, i), secondsOnItem: 20 }));
  const f = join(mkdtempSync(join(tmpdir(), 'pc-')), 'export.jsonl');
  writeFileSync(f, lines.join('\n') + '\n');
  return f;
}
const build = (cFile: string, out: string) => spawnSync('node', [join(root, 'scripts/pilot/build-final-manifest.cjs'), '--ab', AB, '--c', cFile, '--key', KEY, '--approver', 'human:owner', '--review-basis', 'founder-reviewed test basis', '--out-dir', out, '--as-of', '2026-10-09'], { encoding: 'utf8' });

describe('final publishing manifest', () => {
  it('is refused, and nothing is written, when the reviewer misses more than one planted control', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'fm-')), 'refused');
    const r = build(exportFile(() => 'approve'), out);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/REFUSED: Pack C controls caught 0 of 4/);
    expect(existsSync(join(out, 'MANIFEST.md'))).toBe(false);
  });

  it('builds the four sections, names the review basis, and projects four ready venues with Discover held back by its price', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'fm-')), 'ok');
    const r = build(exportFile((o) => (isControl(o) ? 'reject' : 'approve')), out);
    expect(r.status, r.stderr).toBe(0);
    const md = readFileSync(join(out, 'MANIFEST.md'), 'utf8');
    expect(md).toMatch(/Review basis: founder-reviewed test basis/);
    expect(md).toMatch(/## 1\. Human-approved evidence claims \(22\)/);
    expect(md).toMatch(/## 2\. Code changes/);
    expect(md).toMatch(/## 3\. Unresolved or unsupported[\s\S]*pricing\.paid`: \*\*unknown\*\*/);
    expect(md).toMatch(/Discover Children's Story Centre \| not ready \| cost/);
    for (const v of ['Royal Air Force Museum London', 'Horniman Museum and Gardens', 'London Zoo', 'Science Museum']) expect(md).toContain(`| ${v} | **recommendation-ready**`);
    expect(readFileSync(join(out, 'claims/apply.sql'), 'utf8')).toMatch(/-- Review basis: founder-reviewed test basis/);
  });

  it('a card the reviewer marks unknown is listed as unresolved and takes its venue out of the ready set', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'fm-')), 'unk');
    const zoo = Object.keys(key.idMap).find((o) => key.idMap[o].endsWith('ChIJV_iXMtcadkgRqBI84CY_crE:activities.zootown'))!;
    const r = build(exportFile((o) => (isControl(o) ? 'reject' : o === zoo ? 'unknown' : 'approve')), out);
    expect(r.status, r.stderr).toBe(0);
    const md = readFileSync(join(out, 'MANIFEST.md'), 'utf8');
    expect(md).toMatch(/London Zoo[^|]*`activities\.zootown`: \*\*unknown\*\*/);
    expect(md).toMatch(/\| London Zoo \| not ready \| childActivity/);
    expect(execFileSync('cat', [join(out, 'code/activity-evidence.snippet.ts')], { encoding: 'utf8' })).not.toMatch(/ZooTown/);
  });
});
