#!/usr/bin/env node
/**
 * Builds the review page from a local pack (review-triage.cjs --pack): one self-contained HTML file a person opens in a browser.
 *
 *   node scripts/pilot/review-pack.cjs --pack /local/pack.json --out /local/review.html
 *
 * The page holds the venues' surrounding page text, so it stays on the reviewer's machine; it is never committed. It contains no
 * provider (Google) content.
 *
 * WHAT THE REVIEWER SEES FOR EACH ITEM
 *   - the venue, the field, why it is in the queue (route, impact, and each independent check that doubted it, in words)
 *   - the proposed meaning, with the words that are NOT in the quote highlighted, so over-reach is visible without a check finding it
 *   - the quote, in the words around it on the page, with a link to the page
 *   - Approve, Edit (the reviewer writes the meaning the quote supports), Reject, Unknown, and Undo
 * Batch groups open only once their sample items are decided, and a batch approval is one decision per item with a shared id so
 * it can be undone as a whole. A timer runs on the item in view and is stored with the decision.
 *
 * Decisions live in the browser (localStorage) until exported as lines of JSON; `review-import.cjs` chains them into the audit
 * trail and reports the measured time. Nothing is published from here.
 */
const fs = require('node:fs');
const args = process.argv.slice(2);
const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const pack = JSON.parse(fs.readFileSync(flag('--pack'), 'utf8'));
const order = { individual: 0, 'auto-reject': 1, batch: 2, 'accepted-spot-check': 3 };
const TIER_ORDER = { expert: 0, reviewer: 1, grouped: 2 };
const hasTiers = pack.queue.some((i) => i.tier);
const rank = (i) => (i.findings.some((f) => f.level === 'fail') ? 0 : i.findings.length && i.impact === 'high' ? 1 : i.findings.length ? 2 : i.impact === 'high' ? 3 : 4);
if (!hasTiers) pack.queue.sort((a, b) => (order[a.route] ?? 9) - (order[b.route] ?? 9) || rank(a) - rank(b) || a.venue.localeCompare(b.venue));
else pack.queue.sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9));
const data = JSON.stringify(pack).replace(/</g, '\\u003c');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pilot evidence review</title>
<style>
:root{--bg:#f6f4f0;--ink:#1d2430;--mut:#5d6675;--line:#d9d4ca;--card:#fff;--warn:#a85a00;--bad:#b3261e;--ok:#1f6f4a;--hi:#fff1b8;--acc:#244a7c}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--ink:#e8e6e1;--mut:#9aa3b2;--line:#2c323c;--card:#1b2027;--warn:#e0a458;--bad:#ff8a80;--ok:#7fd1a5;--hi:#4a3d00;--acc:#8ab4f8}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;z-index:2;display:flex;gap:16px;flex-wrap:wrap;align-items:center}
main{max-width:860px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:0 0 14px}
.card.decided{opacity:.62}.meta{color:var(--mut);font-size:13px}.chip{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:1px 9px;font-size:12px;margin:2px 4px 2px 0}
.chip.fail{color:var(--bad);border-color:var(--bad)}.chip.warn{color:var(--warn);border-color:var(--warn)}
.ctx{border-left:3px solid var(--line);padding:6px 10px;margin:8px 0;color:var(--mut)}.ctx mark{background:var(--hi);color:var(--ink);padding:0 2px}
.prop mark{background:var(--hi);color:var(--ink)}.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:6px 12px;cursor:pointer}
button.p{background:var(--acc);color:#fff;border-color:var(--acc)}button:disabled{opacity:.4;cursor:not-allowed}textarea{width:100%;font:inherit;margin-top:8px;box-sizing:border-box}
a{color:var(--acc)}h2{font-size:16px;margin:24px 0 8px}.state{font-weight:600}
</style></head><body>
<header><strong>Evidence review</strong><span id="prog" class="meta"></span><label class="meta">Reviewer <input id="who" size="14" placeholder="your name"></label>
<button id="export">Export decisions</button><button id="undo">Undo last</button></header><main id="m"></main>
<script id="d" type="application/json">${data}</script>
<script>
const P=JSON.parse(document.getElementById('d').textContent);const Q=P.queue;const KEY='pilot-review-v1';
let log=JSON.parse(localStorage.getItem(KEY)||'[]');const save=()=>localStorage.setItem(KEY,JSON.stringify(log));
const $=(s,r=document)=>r.querySelector(s);const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const live=()=>{const dead=new Set();for(const e of [...log].reverse()){if(e.decision==='revert'&&!dead.has(e.n))dead.add(e.targets)}return log.filter(e=>!dead.has(e.n))};
const state=()=>{const m=new Map();for(const e of live())if(e.decision!=='revert')m.set(e.itemId,e);return m};
const STOP=new Set('a an and are as at be by for from has have in is it its of on or that the their there these they this to was were will with you your we our can may also not any all about near into than then them so such per each both'.split(' '));
const words=s=>new Set(String(s||'').toLowerCase().replace(/[^a-z0-9£ ]/g,' ').split(' ').filter(w=>w.length>2&&!STOP.has(w)).map(w=>w.replace(/(ing|ies|es|s|ed)$/,'')));
const NEG=/^(not|no|never|cannot|without|unable|n't)$|n't$/i;const hasNeg=t=>String(t||'').toLowerCase().split(/[^a-z']+/).some(w=>NEG.test(w));
const novel=(t,q)=>{const b=words(q);const qneg=hasNeg(q);return String(t||'').split(/(\\s+)/).map(w=>{const k=[...words(w)][0];const neg=NEG.test(w.replace(/[^A-Za-z']/g,''));return (neg&&!qneg)||(k&&!b.has(k))?'<mark>'+esc(w)+'</mark>':esc(w)}).join('')};
const negNote=i=>hasNeg(i.quote)&&!hasNeg(i.proposed)?'<div class="meta" style="color:var(--warn)">The quote contains a negation (not / no / never / cannot). Check that the proposal keeps its meaning.</div>':''
let started=null,current=null;const startTimer=id=>{if(current!==id){current=id;started=Date.now()}};
const secs=()=>started?Math.round((Date.now()-started)/1000):0;
function add(e){e.n=log.length?log[log.length-1].n+1:1;e.at=new Date().toISOString();e.reviewer=$('#who').value||'unnamed';log.push(e);save();render()}
function decide(id,decision,extra={}){add({itemId:id,decision,secondsOnItem:secs(),...extra});current=null}
function sampleDone(g){const s=state();return g.sample.every(id=>s.get(id)&&s.get(id).decision==='approve')}
function render(){const s=state();const done=Q.filter(i=>s.has(i.id)).length;$('#prog').textContent=done+' of '+Q.length+' decided';
 const groups=Object.fromEntries((P.batchGroups||[]).map(g=>[g.key,g]));let h='';let last='';
 for(const i of Q){const d=s.get(i.id);const lab={individual:'Read alone','auto-reject':'Stopped by a check (overturn if wrong)',batch:'Batch group','accepted-spot-check':'Accepted automatically, read as a spot check'}[i.route];
  if(lab!==last){h+='<h2>'+esc(lab)+'</h2>';last=lab}
  const c=i.context;const quote=c?'<div class="ctx">…'+esc(c.before.slice(-220))+'<mark>'+esc(c.quote)+'</mark>'+esc(c.after.slice(0,220))+'…</div>':'<div class="ctx"><mark>'+esc(i.quote)+'</mark> <span class="meta">(page text not in this pack)</span></div>';
  const g=i.batchGroup&&groups[i.batchGroup];
  h+='<section class="card'+(d?' decided':'')+'" data-id="'+esc(i.id)+'"><div class="meta">'+esc(i.venue)+' · '+esc(i.field)+' · '+i.impact+' impact · '+'needs a person'+'</div>'
   +'<div>'+i.findings.map(f=>'<span class="chip '+f.level+'" title="'+esc(f.detail)+'">'+esc(f.id)+': '+esc(f.detail)+'</span>').join('')+(i.reasons||[]).filter(r=>!/^independent/.test(r)).map(r=>'<span class="chip">'+esc(r)+'</span>').join('')+'</div>'
   +'<p class="prop"><b>Proposed:</b> '+novel(i.proposed,i.quote)+'</p><div class="meta">Highlighted words are not in the quote.</div>'+negNote(i)+quote
   +'<div class="meta"><a href="'+esc(i.url)+'" target="_blank" rel="noopener">Open the page</a> · read '+esc(i.readOn)+'</div>'
   +(d?'<div class="state">'+esc(d.decision)+(d.editedText?': '+esc(d.editedText):'')+' <span class="meta">('+d.secondsOnItem+' s)</span></div>'
     :'<div class="row" data-focus="'+esc(i.id)+'"><button class="p" data-a="approve">Approve</button><button data-a="edit">Edit meaning</button><button data-a="reject">Reject</button><button data-a="unknown">Mark unknown</button>'+(g?'<button data-a="batch" '+(sampleDone(g)?'':'disabled title="Approve the sample items first"')+'>Approve all '+g.size+' equivalent</button>':'')+'</div><div class="edit"></div>')
   +'</section>'}
 $('#m').innerHTML=h||'<p>Nothing to review.</p>';
 document.querySelectorAll('.card:not(.decided)').forEach(el=>{const id=el.dataset.id;el.addEventListener('pointerenter',()=>startTimer(id));el.addEventListener('focusin',()=>startTimer(id));
  el.querySelectorAll('button[data-a]').forEach(b=>b.onclick=()=>{startTimer(id);const a=b.dataset.a;
   if(a==='edit'){const box=el.querySelector('.edit');box.innerHTML='<textarea rows="3" placeholder="Write the meaning the quote supports"></textarea><div class="row"><button class="p" data-s>Save edit</button></div>';box.querySelector('[data-s]').onclick=()=>{const t=box.querySelector('textarea').value.trim();if(t)decide(id,'edit',{editedText:t})};return}
   if(a==='batch'){const g=groups[Q.find(x=>x.id===id).batchGroup];const bid='batch-'+Date.now();for(const m of g.members){if(!state().has(m))decide(m,'approve',{batchId:bid,note:'batch'})}return}
   decide(id,a)})})}
$('#undo').onclick=()=>{const l=live().filter(e=>e.decision!=='revert').pop();if(l)add({decision:'revert',targets:l.n,note:'undo'})};
$('#export').onclick=()=>{const t=log.map(e=>JSON.stringify(e)).join('\\n')+'\\n';const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'application/x-ndjson'}));a.download='review-decisions.jsonl';a.click()};
render();
</script></body></html>`;
fs.writeFileSync(flag('--out'), html);
console.log(`wrote ${flag('--out')} (${pack.queue.length} cards, ${(html.length / 1024).toFixed(0)} KB)`);
