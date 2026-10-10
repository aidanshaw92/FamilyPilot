const { CLAIM_MAP } = require('./profile-claims.cjs');

/** Where a profile fact goes if it is approved: a claim, a rule or hours reading, reviewed code data, a note, or nowhere (no field to hold it). */
const disposition = (f, ruleFacts = new Set()) => {
  const key = `${f.sec}.${f.key}`;
  if (CLAIM_MAP[key] || key === 'transport.parking') return 'claim';
  if (ruleFacts.has(key)) return 'venue rule or official-hours claim (structured; a person must approve it)';
  if (CLAIM_MAP[key] || key === 'transport.parking') return 'claim';
  if (f.sec === 'activities' && f.minMonths != null) return 'ships as reviewed activity data (code, by pull request)';
  if (f.sec === 'pricing') return f.key === 'free' ? 'ships as reviewed admission data (code, by pull request)' : 'price: reviewed admission data or held (no claim type)';
  if (f.goodToKnow) return 'note only (good to know); no structured home';
  if (key === 'opening.hours' || key === 'opening.closure') return 'NO HOME: official hours and closures have no claim type';
  if (f.sec === 'transport') return 'NO HOME: stations, buses, fees and entrances have no claim type';
  if (f.sec === 'activities') return 'NO HOME: a plain activity description has no claim type';
  if (f.sec === 'pushchair') return 'NO HOME: pushchair rules and storage have no claim type (only a terrain rating)';
  if (f.sec === 'access') return 'NO HOME: accessibility detail beyond wheelchair and sensory has no claim type';
  if (f.sec === 'considerations') return 'NO HOME: practical rules and closures have no claim type';
  if (f.sec === 'toilets' || f.sec === 'food' || f.sec === 'play') return 'NO HOME: facility detail beyond the mapped facts has no claim type';
  return 'NO HOME: other';
};

module.exports = { disposition };
