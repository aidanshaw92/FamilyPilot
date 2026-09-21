-- The read model for a venue-level age restriction.
--
-- Canonical truth is NOT this column. It is the `agePolicy.<sourceKey>` claims in `venue_claims`,
-- whose JSON holds normalised rules in MONTHS together with the source that stated them. This
-- column is only the projection of those claims that are trusted, in-lifetime, venue-scoped and
-- non-conflicted -- the shape the matcher reads.
--
-- Why a projection rather than editable columns. A previous revision of this work added
-- `min_admission_age` / `max_admission_age` smallints that the editor payload wrote directly.
-- Three problems, all of which this shape removes rather than documents:
--
--   1. A venue-EXCLUDING value could persist here with no claim behind it. `saveMetadata` falls
--      back to the raw editor payload whenever a venue has no active claims, so a typed number
--      became a hard gate with no source. Nothing can write this column except the claim
--      projection, so that is now unrepresentable rather than merely discouraged.
--   2. Whole years cannot state "under 6 months not admitted". Months are the unit a door policy
--      is actually written in for babies, which is exactly the group it matters most for.
--   3. Two scalar keys cannot hold two sources' policies, because the active-claim index is unique
--      per (place, field_key). Composing a min from one source with a max from another would
--      invent a range no source stated.
--
-- Shape, when present:
--   {"minMonthsInclusive": 48, "maxMonthsExclusive": null,
--    "sourceUrl": "https://...", "checkedAt": "2026-09-21"}
--
-- Half-open [min, max), matching the recommendation interval from P0-B1: a minimum of 48 admits a
-- child on their fourth birthday and not the day before; a maximum of 144 admits them through the
-- whole of their eleventh year. NULL means unknown, and unknown never excludes.
--
-- Privileges are inherited: 20260920210000 left this table granting anon/authenticated SELECT
-- only, and a new column carries the table's ACL.

alter table public.venue_family_metadata
  add column if not exists venue_age_restriction jsonb;

-- Shape guard. The matcher treats this column as authoritative, so a malformed row must fail at
-- write time rather than be read as a door policy nobody stated.
alter table public.venue_family_metadata
  drop constraint if exists venue_family_metadata_age_restriction_shape;

alter table public.venue_family_metadata
  add constraint venue_family_metadata_age_restriction_shape check (
    venue_age_restriction is null
    or (
      jsonb_typeof(venue_age_restriction) = 'object'
      -- At least one bound, or the restriction says nothing and should have been null.
      and (
        venue_age_restriction ? 'minMonthsInclusive'
        or venue_age_restriction ? 'maxMonthsExclusive'
      )
      and (
        venue_age_restriction -> 'minMonthsInclusive' is null
        or jsonb_typeof(venue_age_restriction -> 'minMonthsInclusive') in ('number', 'null')
      )
      and (
        venue_age_restriction -> 'maxMonthsExclusive' is null
        or jsonb_typeof(venue_age_restriction -> 'maxMonthsExclusive') in ('number', 'null')
      )
      -- A hard gate without a source is the failure this whole design exists to prevent.
      --
      -- coalesce() is load-bearing. `->` on an absent key yields SQL NULL, jsonb_typeof(NULL) is
      -- NULL, and `NULL = 'string'` is NULL -- which a CHECK treats as satisfied, not violated.
      -- Without it this clause accepts exactly the row it exists to reject. Proven by test.
      and coalesce(jsonb_typeof(venue_age_restriction -> 'sourceUrl'), 'missing') = 'string'
    )
  );

comment on column public.venue_family_metadata.venue_age_restriction is
  'READ MODEL ONLY. Projection of trusted, in-lifetime, venue-scoped, non-conflicted '
  'agePolicy.<sourceKey> claims, in months, half-open [min, max). Never written from an editor '
  'payload. NULL means unknown, which never excludes. Canonical truth is venue_claims.';
