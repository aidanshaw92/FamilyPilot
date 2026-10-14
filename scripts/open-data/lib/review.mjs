/**
 * The ten records a person reads first, in the shape the review asked for: where each came from and under what licence, its category as the
 * source states it and as we propose it, whether it is a duplicate of a stored place, where it is (from the source, never geocoded), which
 * family facilities the SOURCE states, and which fields are simply unknown.
 *
 * Pure: it only reshapes what the dry run already decided. It adds no fact, reads no file and calls nothing.
 */

/** Every fact the pipeline can carry, so "unknown" can be listed rather than implied. */
const FACTS = ['stepFree', 'toilets', 'babyChanging', 'fee', 'openingHoursText', 'minAge', 'maxAge'];

/** Keys of source_tags that are facts about the place rather than what decided its group. */
const FACT_TAG_KEYS = ['wheelchair', 'toilets', 'changing_table', 'fee', 'opening_hours', 'min_age', 'max_age'];

/** The licence and credit of the OpenStreetMap extract. One batch has one of these; it is recorded once, here, not guessed per row. */
export function osmBatch({ version, input }) {
  return {
    source: 'OpenStreetMap, Greater London extract (Geofabrik)',
    version,
    input,
    licence: 'ODbL-1.0',
    licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution: '© OpenStreetMap contributors',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
  };
}

/**
 * @param {{ label: string, row: any, derivedFacts?: Record<string, unknown>, playgroundInside?: boolean | null, linkedTo?: string | null }} entry
 * @param {ReturnType<typeof osmBatch>} batch
 * @param {{ links?: any[], stored?: any[] }} [context]
 */
export function reviewRecord(entry, batch, context = {}) {
  // The sample carries the working fields on the row; the written sample-10.json carries them beside it. Either shape works.
  const { label, row } = entry;
  const derivedFacts = entry.derivedFacts ?? row._facts ?? {};
  const playgroundInside = entry.playgroundInside ?? row._playgroundInside ?? null;
  const linkedTo = entry.linkedTo ?? row._linked ?? null;
  const link = linkedTo ? (context.links ?? []).find((l) => l.open_data_place === row.familypilot_place_id) : null;
  const stored = linkedTo ? (context.stored ?? []).find((s) => s.id === linkedTo) : null;
  const stated = Object.keys(derivedFacts);
  const unknown = [...FACTS.filter((fact) => !stated.includes(fact)), ...(row.website ? [] : ['website']), 'operating status'];
  return {
    label,
    source: {
      record: row.source_record_id,
      name: batch.source,
      version: batch.version,
      licence: batch.licence,
      licenceUrl: batch.licenceUrl,
      attribution: batch.attribution,
    },
    // The source's own words for what the thing is, then ours. Neither is a Google type.
    originalCategory: { sourceTags: Object.fromEntries(Object.entries(row.source_tags ?? {}).filter(([k]) => !FACT_TAG_KEYS.includes(k))) },
    proposedCategory: { group: row.group_id, subtype: row.subtype },
    identity: {
      name: row.name,
      nameFromSource: true,
      duplicateInsideBatch: false, // a duplicate inside the batch was rejected at the identity gate and is not a candidate
      duplicateOfStoredPlace: linkedTo,
      storedCategory: stored ? stored.category : null,
      matchConfidence: link ? link.match_confidence : null,
      needsPersonToReview: link ? Boolean(link.needs_review) : false,
    },
    independentCoordinates: { lat: row.lat, lng: row.lng, from: 'the source feature', geocoded: false, googleValueUsed: false },
    confirmedFamilyFacilities: derivedFacts,
    unknownFields: unknown,
    operatingStatus: { value: row.operating_status, evidence: row.status_evidence },
    playgroundInside,
    website: row.website ?? null,
  };
}

export function reviewSample(sample, batch, context) {
  return sample.map((entry) => reviewRecord(entry, batch, context));
}

/** The same ten records as a short page a person can read. */
export function renderReview(reviews, batch) {
  const lines = [`# First ten records: ${batch.source}, version ${batch.version}`, '', `Licence ${batch.licence} (${batch.licenceUrl}). Credit: "${batch.attribution}". **Nothing is imported.**`, ''];
  reviews.forEach((r, i) => {
    lines.push(`## ${i + 1}. ${r.identity.name} (${r.label})`, '');
    lines.push(`- **Source:** ${r.source.record}`);
    lines.push(`- **Source's own tags:** ${JSON.stringify(r.originalCategory.sourceTags)}  **Proposed group:** ${r.proposedCategory.group} / ${r.proposedCategory.subtype}`);
    lines.push(`- **Duplicate of a stored place:** ${r.identity.duplicateOfStoredPlace ? `yes, ${r.identity.duplicateOfStoredPlace} (confidence ${r.identity.matchConfidence}${r.identity.needsPersonToReview ? ', a person must review' : ''})` : 'no'}`);
    lines.push(`- **Position (from the source, not geocoded):** ${r.independentCoordinates.lat}, ${r.independentCoordinates.lng}`);
    lines.push(`- **Facilities the source states:** ${Object.keys(r.confirmedFamilyFacilities).length ? JSON.stringify(r.confirmedFamilyFacilities) : 'none'}`);
    lines.push(`- **Unknown:** ${r.unknownFields.join(', ')}`, '');
  });
  return lines.join('\n');
}
