// A crash report from the app, kept deliberately small: what broke and where, nothing about the family.
// Allowlisted fields only, every string capped and scrubbed. It is written to the function log (searchable by "client-error"),
// not to a table, so it needs no migration and holds nothing that could identify a household.
const KINDS=['render','uncaught','promise','api'];
const cap=(v,n)=>typeof v==='string'?v.slice(0,n):'';
function scrub(text,n) {
 return cap(text,n*2)
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,'[email]')
  .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]*)?/g,'[token]')
  .replace(/\b[A-Za-z0-9_-]{32,}\b/g,'[id]')
  .replace(/\b-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\b/g,'[location]')
  // Dates of any common shape: a date of birth is the one thing a message must never carry.
  .replace(/\b\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?\b/g,'[date]')
  .replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g,'[date]')
  .replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+\d{2,4}\b/gi,'[date]')
  .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi,'[postcode]')
  .slice(0,n);
}
/** The path only: no query string, no fragment, and ids in the path are replaced. */
function scrubRoute(route) {
 // Whatever follows a route that takes an id or a secret code (a venue, a restaurant, an invitation) is replaced, whatever it looks like.
 return scrub(cap(route,200).split(/[?#]/)[0]
  .replace(/\/(venue|restaurant|invite|enrichment)\/[^/]+/gi,'/$1/[id]')
  .replace(/\/(fp-[a-z0-9_-]+|[0-9a-f]{8}-[0-9a-f-]{27,})/gi,'/[id]'),120);
}
function sanitiseClientError(body) {
 if(!body||typeof body!=='object')throw new Error('Invalid report');
 const kind=KINDS.includes(body.errorKind)?body.errorKind:'uncaught';
 const message=scrub(body.message,300);
 if(!message)throw new Error('Invalid report');
 return {kind,message,name:scrub(body.name,60),stack:scrub(body.stack,900),route:scrubRoute(body.route),build:scrub(body.build,40),platform:scrub(body.platform,40),viewport:/^\d{2,5}x\d{2,5}$/.test(body.viewport||'')?body.viewport:''};
}
const recent=new Map();
/** Best effort, per function instance: at most 10 reports a minute for one account. */
function allowReport(userId,now=Date.now()) {
 const hits=(recent.get(userId)||[]).filter(t=>now-t<60000);
 if(hits.length>=10){recent.set(userId,hits);return false;}
 hits.push(now);recent.set(userId,hits);
 if(recent.size>500)for(const key of recent.keys()){if(!(recent.get(key)||[]).some(t=>now-t<60000))recent.delete(key);}
 return true;
}
module.exports={sanitiseClientError,allowReport,scrub};
