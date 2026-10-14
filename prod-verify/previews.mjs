// One-off, read-only: is each open branch's Preview deployment public, or behind Vercel's login? GET with redirects NOT followed. Nothing is stored.
const branches = ['feat/open-data-dry-run', 'docs/open-data-dry-run', 'fix/discovery-exclusions', 'feat/explore-nearby', 'docs/catalogue-expansion', 'feat/optional-lunch', 'pilot/working-product', 'pilot/profiles-demo', 'docs/step1-final-gate', 'feat/excellent-score-step', 'docs/excellent-rule-v2', 'fix/map-compliance', 'feat/catalogue-recovery', 'main'];
for (const b of branches) {
  const label = `family-pilot-git-${b.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-aidanshaw92s-projects`;
  if (label.length > 63) { console.log(`RESULT preview ${b}: label is ${label.length} characters, Vercel shortens it; not guessed`); continue; }
  const url = `https://${label}.vercel.app/`;
  try {
    const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'FamilyPilot-preview-check/1.0' } });
    const loc = r.headers.get('location') ?? '';
    console.log(`RESULT preview ${b}: HTTP ${r.status}${loc ? ` -> ${new URL(loc, url).host}` : ''}${r.headers.get('x-vercel-protection-bypass') ? ' (bypass header)' : ''}`);
  } catch (e) { console.log(`RESULT preview ${b}: ${e.code ?? e.message}`); }
}
