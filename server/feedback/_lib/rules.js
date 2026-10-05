/**
 * Parent visit observations: what may be asked, what may be stored, and how observations and official evidence
 * are reconciled.
 *
 * THE RECONCILIATION RULE (pinned by familypilot/src/__tests__/visit-reconciliation.test.ts):
 *
 *   R1  An observation counts only if it is active, is from the last 90 days, and is not "did not check". An
 *       account counts once: its latest observation for a field is the one that stands.
 *   R2  An official claim (a venue_claims row with a source) is NEVER rewritten by an observation. Observations are
 *       reported next to it, separately, with their count and recency.
 *   R3  An observation that contradicts the official claim and is dated on or after the claim's check date puts
 *       the field in `needs_recheck`: the value shown becomes "unknown" until a source recheck, and the claim
 *       itself is untouched. A later source check (check date after the visit) resolves it; an older source cannot
 *       dismiss a newer observation.
 *   R4  With no official claim, observations are `parent_reported`, never `source_checked` or `editor_checked`,
 *       and the value stays "unknown": a parent's report is a lead, not a fact.
 *       - one account            -> agreement `single`
 *       - two or more accounts who agree -> agreement `corroborated` (stronger, still not official)
 *       - accounts who disagree  -> `needs_recheck`, agreement `contested`
 *   R5  Absence of any observation is never "no": unknown stays unknown.
 *
 * THE CONFIDENCE CONTRACT (`confidenceOf`; pinned by visit-confidence.test.ts). Every field carries `confidence`:
 *
 *   basis             authoritative  influencesFit  meaning
 *   official          yes            (venue fact)   a sourced claim stands and nothing newer contradicts it
 *   needs_recheck     no             yes            a recent observation contradicts the official claim, or parents
 *                                                   disagree with each other: shown as "needs rechecking", value unknown
 *   parent_corroborated no           yes (explain)  two or more INDEPENDENT accounts, within 90 days, agree; nothing official
 *   parent_single     no             no             exactly one account: a lead for the next visitor, nothing more
 *   none              no             no             nobody has said anything
 *
 *   Only `official` is ever authoritative: parent evidence cannot reach it however many accounts agree. Independence:
 *   distinct accounts, and accounts linked as partners count once (one household is one witness). "Influences Family
 *   Fit" means the explanation may mention it, labelled as parent-reported; it never raises a verdict, and it never
 *   turns an unknown into a fact. Fields are only the five listed in FIELDS: there is no age field, so a parent
 *   observation cannot create a recommended age range or an age policy.
 *
 * WHAT IS ASKED NEXT (`priority`, lower is asked first; `selectQuestions` takes the first three below 9):
 *
 *   0  disputed or contradicted (`needs_recheck`)
 *   1  unknown: no source, no report
 *   2  stale: the official source was last checked more than STALE_AFTER_DAYS ago
 *   3  a single parent report and nothing official
 *   4  corroborated by parents, nothing official (one more confirmation is worth less)
 *   9  confirmed by a recent source and not contradicted: not asked
 */
const FIELDS = {
  babyChanging: {label:'Baby changing',claim:'familyFacilities.babyChanging',question:'Was a baby-changing facility available to use?',values:['yes','no','unavailable','did_not_check']},
  pushchair: {label:'Buggy access',claim:'pushchairSuitability',question:'Could you get around comfortably with your buggy?',values:['good','mixed','difficult','did_not_check']},
  toilets: {label:'Toilets',claim:'familyFacilities.toilets',question:'Were toilets available to use?',values:['yes','no','unavailable','did_not_check']},
  parking: {label:'Parking',claim:'familyFacilities.parking',question:'Was parking available at the venue?',values:['yes','no','unavailable','did_not_check']},
  cafe: {label:'Café',claim:'familyFacilities.cafe',question:'Was the venue’s café open during your visit?',values:['yes','no','unavailable','did_not_check']},
};

/** Fields in the order they are worth asking about when everything else is equal: the facts that decide a day. */
const VALUE_ORDER = ['babyChanging','pushchair','toilets','cafe','parking'];

const OBSERVATION_WINDOW_DAYS = 90;
const STALE_AFTER_DAYS = 60;
const DAY_MS = 86400000;

function validateReport(body,now=Date.now()) {
  if(!body || typeof body.venueId!=='string' || !/^fp-[a-z0-9_-]{1,230}$/i.test(body.venueId)) throw new Error('Choose a valid venue.');
  if(typeof body.visitDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.visitDate))throw new Error('Choose a valid visit date.');
  const day=Date.parse(body.visitDate+'T00:00:00Z');
  // Allow today's date in UTC+14; never a future local calendar day.
  if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==body.visitDate||day>now+14*3600000||now-day>30*DAY_MS)throw new Error('Report a visit from the last 30 days.');
  if(body.attended!==true)throw new Error('Confirm that you visited before reporting.');
  const answers=body.answers;
  if(!answers||Array.isArray(answers)||typeof answers!=='object'||Object.keys(answers).length<1||Object.keys(answers).length>3)throw new Error('Answer up to three questions.');
  for(const [key,value] of Object.entries(answers))if(!FIELDS[key]?.values.includes(value))throw new Error('Choose one of the listed answers.');
  if(Object.values(answers).every(v=>v==='did_not_check'))throw new Error('Choose at least one thing you checked, or skip this visit.');
  return {venueId:body.venueId,visitDate:body.visitDate,answers};
}

/** The tier a field is in for "what should we ask next". See the header. */
function priorityOf(field) {
  if(field.status==='needs_recheck')return 0;
  if(field.status==='unknown')return 1;
  if(field.status==='parent_reported')return field.agreement==='corroborated'?4:3;
  if(field.stale)return 2;
  return 9;
}

/**
 * The explicit confidence of a field (see the header). `label` is the wording a screen may use; none of it says "confirmed"
 * unless the basis is `official`.
 */
function confidenceOf(field) {
  const n=field.reportCount;
  if(field.status==='needs_recheck')return {basis:'needs_recheck',authoritative:false,influencesFit:true,label:'Needs rechecking',families:n};
  if(field.status==='source_checked'||field.status==='editor_checked')return {basis:'official',authoritative:true,influencesFit:false,label:field.status==='source_checked'?'Confirmed by the venue’s own source':'Confirmed by an editor',families:n};
  if(field.status==='parent_reported'&&field.agreement==='corroborated')return {basis:'parent_corroborated',authoritative:false,influencesFit:true,label:`Reported by ${n} families, not confirmed by the venue`,families:n};
  if(field.status==='parent_reported')return {basis:'parent_single',authoritative:false,influencesFit:false,label:'Reported by one family, not confirmed by the venue',families:n};
  return {basis:'none',authoritative:false,influencesFit:false,label:'Not confirmed',families:0};
}

function summarizeReports(claims,reports,now=Date.now(),households=new Map()) {
  const fields={};
  for(const [key,definition] of Object.entries(FIELDS)) {
    const claim=claims.find(c=>c.fieldKey===definition.claim);
    const observations=reports.filter(r=>r.status==='active'&&r.answers[key]&&r.answers[key]!=='did_not_check'&&now-Date.parse(r.visit_date+'T00:00:00Z')<=OBSERVATION_WINDOW_DAYS*DAY_MS);
    // One witness per household: accounts linked as partners share a key, and the latest report for that key stands.
    const latestByUser=new Map();
    for(const r of observations.sort((a,b)=>b.visit_date.localeCompare(a.visit_date)||b.created_at.localeCompare(a.created_at))){const witness=households.get(r.user_id)||r.user_id;if(!latestByUser.has(witness))latestByUser.set(witness,r);}
    const recent=[...latestByUser.values()];
    // A later source check can resolve a discrepancy; an older source cannot dismiss a new report.
    const afterSource=recent.filter(r=>!claim||r.visit_date>=String(claim.checkedAt).slice(0,10));
    const expected=claim?.valueJson==='excellent'&&key==='pushchair'?'good':claim?.valueJson;
    const conflicting=afterSource.some(r=>r.answers[key]==='unavailable'||(expected!==undefined&&r.answers[key]!==expected));
    const values=new Set(afterSource.map(r=>r.answers[key]));
    const disputed=conflicting||values.size>1;
    const distinct=new Set(recent.map(r=>r.answers[key]));
    const agreement=recent.length===0?'none':distinct.size>1?'contested':recent.length>=2?'corroborated':'single';
    const checkedMs=claim?Date.parse(String(claim.checkedAt)):NaN;
    const stale=Boolean(claim)&&Number.isFinite(checkedMs)&&now-checkedMs>STALE_AFTER_DAYS*DAY_MS;
    // Observations are displayed separately. They never manufacture official claims.
    const field={label:definition.label,question:definition.question,status:disputed?'needs_recheck':claim?(claim.sourceUrl?'source_checked':'editor_checked'):recent.length?'parent_reported':'unknown',
      value:disputed?'unknown':claim?.valueJson??'unknown',sourceUrl:claim?.sourceUrl??null,checkedAt:claim?.checkedAt??null,
      reportCount:recent.length,lastReportedAt:recent[0]?.visit_date??null,
      observations:[...new Set(recent.map(r=>r.answers[key]))],
      agreement,stale};
    fields[key]={...field,priority:priorityOf(field),confidence:confidenceOf(field)};
  }
  return fields;
}

/**
 * The next questions, most useful first, at most three, and none for a field that is confirmed and fresh. When every
 * field is confirmed the list is empty: a visit to a fully known venue asks nothing.
 */
function selectQuestions(fields) {
  return VALUE_ORDER
    .filter(key=>(fields[key]?.priority??1)<9)
    .sort((a,b)=>(fields[a]?.priority??1)-(fields[b]?.priority??1)||VALUE_ORDER.indexOf(a)-VALUE_ORDER.indexOf(b))
    .slice(0,3);
}

module.exports={FIELDS,VALUE_ORDER,OBSERVATION_WINDOW_DAYS,STALE_AFTER_DAYS,validateReport,summarizeReports,selectQuestions,priorityOf,confidenceOf};
