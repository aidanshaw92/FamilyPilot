/**
 * Reviewed activity evidence: what a venue's own pages say children of an age can DO there.
 *
 * Prepared on 2026-10-08 from pages already stored from each venue's own website (no fetch, no provider call), and read
 * by a person. See docs/EXCELLENT_RULE_V2.md for the rule. Each entry is one of:
 *
 *   provision  a permanent playground, play area, soft play, space or set of exhibits described for an age
 *   programme  classes, sessions or a regular event for an age, on set days
 *
 * A provision covering a child can support Excellent; a programme names the child but never does, because a family may
 * not visit on the day it runs. Facilities (toilets, parking, access) are logistics and never appear here.
 *
 * Bands are the venue's words only: a stated age ("4 to 14", "up to 14", "0-2", "under 7s", "6 months to 10 years") or a
 * standard age term naming the provision itself ("toddler soft play": 1 to 3). The excerpt is the page's own words,
 * whitespace-normalised, found in the stored text of that URL on the stated date.
 *
 * Not evidence, and so not here (final review, 2026-10-08):
 *   - a page heading or tagline, however worded ("Free activities for everyone from toddlers to teens", RAF Museum
 *     London): it markets the page, and the permanent offer beneath it states no age of its own;
 *   - copy about the whole venue ("From toddlers ... to older children ... something here for every age", Hobbledown
 *     Heath);
 *   - a relative audience with no age ("Older children can use up their energy ... at the large play area", Swanley
 *     Park): the play area is real, but the page does not say for what age.
 *
 * Each entry is relied on for 90 days from the reading (the lifetime of every non-facility claim), then it stops counting
 * until a person re-reads the page. It is never extended without a new reading.
 */
export type ActivityEvidenceKind = 'provision' | 'programme';

export interface ReviewedActivityEvidence {
  venueId: string;
  venueName: string;
  kind: ActivityEvidenceKind;
  /** Inclusive lower bound, in months. */
  minMonths: number;
  /** Exclusive upper bound, in months. */
  maxMonthsExclusive: number;
  /** What a parent reads, before "for <name>'s age". */
  label: string;
  evidence: { url: string; retrievedAt: string; subjectScope: 'venue_own_subtree' | 'venue_named_page'; excerpt: string };
  reviewNotes: string;
}

export const ACTIVITY_EVIDENCE_LIFETIME_DAYS = 90;

export const REVIEWED_ACTIVITY_EVIDENCE: readonly ReviewedActivityEvidence[] = [
  {
    venueId: 'fp-google-ChIJOWBQvA4FdkgRQf5iYYFF1v4',
    venueName: 'Battersea Park',
    kind: 'provision',
    minMonths: 48,
    maxMonthsExclusive: 180,
    label: 'Playground for children 4 to 14',
    evidence: {
      url: 'https://www.wandsworth.gov.uk/leisure-and-culture/parks-and-open-spaces/childrens-playgrounds/battersea-park-playground-for-toddlers-and-juniors/',
      retrievedAt: '2026-10-01',
      subjectScope: 'venue_named_page',
      excerpt: 'This playground is suitable for children 4 to 7, 8 to 14 years old',
    },
    reviewNotes: 'The page names the playground "for toddlers and juniors" but states 4 to 14 as its age group; the stated numbers are used, so it does not cover a toddler.',
  },
  {
    venueId: 'fp-osm-679119297',
    venueName: 'Chiswick House',
    kind: 'provision',
    minMonths: 0,
    maxMonthsExclusive: 84,
    label: 'Under-7s playground',
    evidence: {
      url: 'https://chiswickhouseandgardens.org.uk/plan-your-visit/family-activities/',
      retrievedAt: '2026-10-01',
      subjectScope: 'venue_own_subtree',
      excerpt: 'Visit our under 7s playground beside the Café',
    },
    reviewNotes: 'Permanent playground. A child of 7 or more is not covered, and that is not held against the venue.',
  },
  {
    venueId: 'fp-google-ChIJJ2CD1mEddkgRAuOi9iSzBrk',
    venueName: "Discover Children's Story Centre",
    kind: 'provision',
    minMonths: 0,
    maxMonthsExclusive: 36,
    label: 'Baby and toddler sensory space (ages 0 to 2)',
    evidence: {
      url: 'https://discover.org.uk/',
      retrievedAt: '2026-09-26',
      subjectScope: 'venue_own_subtree',
      excerpt: 'Baby and Toddler Sensory Space Dates: Daily Age guide: 0-2',
    },
    reviewNotes: 'Runs daily, so a provision rather than a programme. Covers under-3s only; says nothing against older children.',
  },
  {
    venueId: 'fp-google-ChIJ0ZZcI7hrdkgR4ooSY3kKOMo',
    venueName: 'Flip Out Watford',
    kind: 'provision',
    minMonths: 12,
    maxMonthsExclusive: 48,
    label: 'Toddler soft play',
    evidence: {
      url: 'https://www.flipout.co.uk/locations/watford',
      retrievedAt: '2026-10-01',
      subjectScope: 'venue_own_subtree',
      excerpt: 'Toddler Soft Play',
    },
    reviewNotes: 'Listed among the venue’s permanent attractions. The "under 1.2m" sessions are a height rule and are not used.',
  },
  {
    venueId: 'fp-google-ChIJ7_PV980bdkgROekbwOVWVfo',
    venueName: 'Babylon Park London',
    kind: 'provision',
    minMonths: 12,
    maxMonthsExclusive: 48,
    label: 'Soft play for toddlers',
    evidence: {
      url: 'https://babylonpark.com/london/?utm_source=google&utm_medium=localcard&utm_campaign=309703_lon',
      retrievedAt: '2026-10-02',
      subjectScope: 'venue_own_subtree',
      excerpt: 'soft play areas for toddlers and kids',
    },
    reviewNotes: '"Kids" is a vague audience and covers no one; only the toddler band is used.',
  },
  {
    venueId: 'fp-google-ChIJYfO01G0DdkgR4H52YH-11gw',
    venueName: 'Burgess Park',
    kind: 'provision',
    minMonths: 0,
    maxMonthsExclusive: 180,
    label: 'Play and climbing equipment for children up to 14',
    evidence: {
      url: 'https://www.southwark.gov.uk/culture-and-sport/parks-and-open-spaces/find-park/burgess-park',
      retrievedAt: '2026-10-01',
      subjectScope: 'venue_named_page',
      excerpt: 'play and climbing equipment for children up to 14 years old',
    },
    reviewNotes: 'The council’s page for the park; it also states separate play areas for under and over 5s. The upper end is the page’s own words.',
  },
  {
    venueId: 'fp-google-ChIJ_zIJCh8XdkgRnCvSmVMa1iY',
    venueName: "Belmont Children's Farm",
    kind: 'provision',
    minMonths: 6,
    maxMonthsExclusive: 132,
    label: 'Soft play for 6 months to 10 years',
    evidence: {
      url: 'https://www.belmontfarm.co.uk/',
      retrievedAt: '2026-10-01',
      subjectScope: 'venue_own_subtree',
      excerpt: 'soft play area accommodates children from 6 months to 10 years',
    },
    reviewNotes: 'Purpose-built soft play; the separate soft play page states the same range.',
  },
  {
    venueId: 'fp-google-ChIJVTZUsMcCdkgRMc_-OpJq9v8',
    venueName: 'London Museum Docklands',
    kind: 'provision',
    minMonths: 0,
    maxMonthsExclusive: 96,
    label: 'Interactive play area for under-8s (Mudlarks)',
    evidence: {
      url: 'https://www.londonmuseum.org.uk/docklands/',
      retrievedAt: '2026-10-01',
      subjectScope: 'venue_own_subtree',
      excerpt: 'Mudlarks family gallery Get hands-on in our interactive play area for under-8s',
    },
    reviewNotes: 'Quoted from the museum’s own page, where it carries no date. The organisation’s events feed also lists it with a rolling two-week window; that page is not the venue’s and is not used.',
  },
  {
    venueId: 'fp-google-ChIJRfXNwPoBdkgRqdTuM7Baxuw',
    venueName: 'Beckenham Place Park',
    kind: 'programme',
    minMonths: 48,
    maxMonthsExclusive: 180,
    label: 'Junior parkrun for ages 4 to 14',
    evidence: {
      url: 'https://www.beckenhamplacepark.com/news/free-activities-for-children-and-young-people',
      retrievedAt: '2026-10-01',
      subjectScope: 'venue_own_subtree',
      excerpt: 'Junior Park run for 4-14 year olds',
    },
    reviewNotes: 'A weekly run: names a child, never makes Excellent.',
  },
  {
    venueId: 'fp-google-ChIJId2oNroFdkgReafXXIrGnkY',
    venueName: 'Frameless',
    kind: 'programme',
    minMonths: 12,
    maxMonthsExclusive: 48,
    label: 'Multi-sensory tots classes',
    evidence: {
      url: 'https://frameless.com/',
      retrievedAt: '2026-10-01',
      subjectScope: 'venue_own_subtree',
      excerpt: 'Multi-Sensory Tots Classes',
    },
    reviewNotes: 'Classes on set days.',
  },
  {
    venueId: 'fp-google-ChIJf9LtmOcddkgRRv6MezIdvSM',
    venueName: 'William Morris Gallery',
    kind: 'programme',
    minMonths: 24,
    maxMonthsExclusive: 216,
    label: 'Drop-in family activity sessions for ages 2 and up',
    evidence: {
      url: 'https://www.wmgallery.org.uk/visit/facilities/',
      retrievedAt: '2026-10-01',
      subjectScope: 'venue_own_subtree',
      excerpt: 'Activities are suitable for children aged 2+',
    },
    reviewNotes: 'Two morning drop-in sessions; "2+" is read as 2 to 17.',
  },
  // --- Pilot profiles (docs/pilot): proposed from each venue's own pages on 2026-10-08, awaiting a person's decision ---
  {
    venueId: 'fp-google-ChIJJ2CD1mEddkgRAuOi9iSzBrk',
    venueName: 'Discover Children\'s Story Centre',
    kind: 'programme',
    minMonths: 0,
    maxMonthsExclusive: 36,
    label: 'Baby Storytelling, for 0 to 2',
    evidence: {
      url: 'https://www.discover.org.uk/',
      retrievedAt: '2026-10-08',
      subjectScope: 'venue_own_subtree',
      excerpt: 'Baby Storytelling Dates: Every day * Age guide: 0-2 Duration: 30 mins * Times vary £2 in addition to your Entry ticket.',
    },
    reviewNotes: 'Pilot profile (docs/pilot): proposed, awaiting a person. A programme on set days; names the child but never supports Excellent.',
  },
  {
    venueId: 'fp-google-ChIJJ2CD1mEddkgRAuOi9iSzBrk',
    venueName: 'Discover Children\'s Story Centre',
    kind: 'programme',
    minMonths: 0,
    maxMonthsExclusive: 72,
    label: 'Storytelling sessions, for 0 to 5',
    evidence: {
      url: 'https://www.discover.org.uk/',
      retrievedAt: '2026-10-08',
      subjectScope: 'venue_own_subtree',
      excerpt: 'Storytelling: Julian Is a Mermaid Dates: 2 Aug – 18 Oct * Age guide: 0-5 Duration: 25 mins * Every day, various times',
    },
    reviewNotes: 'Pilot profile (docs/pilot): proposed, awaiting a person. A programme on set days; names the child but never supports Excellent.',
  },
  {
    venueId: 'fp-google-ChIJJ2CD1mEddkgRAuOi9iSzBrk',
    venueName: 'Discover Children\'s Story Centre',
    kind: 'programme',
    minMonths: 0,
    maxMonthsExclusive: 108,
    label: 'Luna Loves London immersive exhibition, for 0 to 8',
    evidence: {
      url: 'https://www.discover.org.uk/',
      retrievedAt: '2026-10-08',
      subjectScope: 'venue_own_subtree',
      excerpt: 'Exhibition Luna Loves London Dates: OPEN NOW * Age guide: 0-8 Duration: 50 mins * Every day, various times',
    },
    reviewNotes: 'Pilot profile (docs/pilot): proposed, awaiting a person. A programme on set days; names the child but never supports Excellent.',
  },
  {
    venueId: 'fp-google-ChIJV_iXMtcadkgRqBI84CY_crE',
    venueName: 'London Zoo',
    kind: 'provision',
    minMonths: 0,
    maxMonthsExclusive: 108,
    label: 'ZooTown: indoor role-play adventure, best for up to 8',
    evidence: {
      url: 'https://www.londonzoo.org/plan-your-visit/frequently-asked-questions',
      retrievedAt: '2026-10-08',
      subjectScope: 'venue_own_subtree',
      excerpt: 'ZooTown is a brand new indoor role play adventure for kids in the heart of London Zoo aimed at children aged up to 8.',
    },
    reviewNotes: 'Pilot profile (docs/pilot): proposed, awaiting a person. A permanent provision described for an age.',
  },
  {
    venueId: 'fp-google-ChIJP9oAE0MFdkgR3iKGFKZO1SE',
    venueName: 'Science Museum',
    kind: 'provision',
    minMonths: 36,
    maxMonthsExclusive: 84,
    label: 'The Garden: hands-on water, light, sound and construction play, for 3 to 6',
    evidence: {
      url: 'https://www.sciencemuseum.org.uk/visit/young-explorers-guide-science-museum',
      retrievedAt: '2026-10-08',
      subjectScope: 'venue_own_subtree',
      excerpt: 'check out one of our family favourites and a must-visit for 3–6-year-olds, The Garden',
    },
    reviewNotes: 'Pilot profile (docs/pilot): proposed, awaiting a person. A permanent provision described for an age.',
  },
  {
    venueId: 'fp-google-ChIJP9oAE0MFdkgR3iKGFKZO1SE',
    venueName: 'Science Museum',
    kind: 'programme',
    minMonths: 0,
    maxMonthsExclusive: 96,
    label: 'Bubble Explorers live show, for children 7 and under',
    evidence: {
      url: 'https://www.sciencemuseum.org.uk/visit/young-explorers-guide-science-museum',
      retrievedAt: '2026-10-08',
      subjectScope: 'venue_own_subtree',
      excerpt: 'Perfect for children aged 7 and under, Bubble Explorer s takes place on weekends and every day during school holidays.',
    },
    reviewNotes: 'Pilot profile (docs/pilot): proposed, awaiting a person. A programme on set days; names the child but never supports Excellent.',
  },
  {
    venueId: 'fp-google-ChIJP9oAE0MFdkgR3iKGFKZO1SE',
    venueName: 'Science Museum',
    kind: 'provision',
    minMonths: 84,
    maxMonthsExclusive: 180,
    label: 'Wonderlab: interactive science gallery, for 7 to 14',
    evidence: {
      url: 'https://www.sciencemuseum.org.uk/visit/space-lovers-guide-science-museum',
      retrievedAt: '2026-10-08',
      subjectScope: 'venue_own_subtree',
      excerpt: 'Visit Wonderlab (level 3), our interactive gallery for children aged 7-14',
    },
    reviewNotes: 'Pilot profile (docs/pilot): proposed, awaiting a person. A permanent provision described for an age.',
  },
];
