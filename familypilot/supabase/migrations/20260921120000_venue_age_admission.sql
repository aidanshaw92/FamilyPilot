-- A venue-level age prohibition, as a fact distinct from a recommendation.
--
-- `min_recommended_age` / `max_recommended_age` say which ages a venue SUGGESTS it suits. P0-B1
-- settled that they are advice: they rank a venue and explain it, and may never exclude one,
-- because a three-year-old at a venue recommended for 5+ is a judgement call for the parent.
--
-- These two columns are the other kind of age fact: "under 4s are not admitted", "designed for
-- under 12s". That is not advice, it is a door the family will be turned away at, so it is the
-- only age fact allowed to make a venue ineligible.
--
-- Deliberately separate columns rather than reusing the recommendation ones. Collapsing them is
-- exactly the mistake `childAgeFit` made -- one field meaning both "suits these ages" and "admits
-- these ages" -- which is why every producer emitted it as `required` and an absent recommendation
-- silently rejected the venue.
--
-- Nothing populates these yet, and nothing in this migration writes a value. Age facts require
-- explicit editorial review and are never published from model output
-- (docs/VENUE_DATA_AUTOMATION.md), so the values arrive one at a time through the existing claim
-- approval path as `minAdmissionAge` / `maxAdmissionAge` claims. Until then every venue reads
-- unknown, and unknown never excludes.
--
-- The privileges on this table are inherited: 20260920210000 left `venue_family_metadata` granting
-- `anon`/`authenticated` SELECT only, and a new column carries the table's ACL, so these need no
-- grant of their own.

alter table public.venue_family_metadata
  add column if not exists min_admission_age smallint,
  add column if not exists max_admission_age smallint;

-- Bounds that catch a transposed or nonsense editorial value rather than trusting the form.
-- 0 is meaningful as a minimum (explicitly "all ages admitted"); 18 is the upper bound because
-- this is a children's-outing product and anything above it is a data-entry error, not a policy.
alter table public.venue_family_metadata
  drop constraint if exists venue_family_metadata_admission_age_range;

alter table public.venue_family_metadata
  add constraint venue_family_metadata_admission_age_range check (
    (min_admission_age is null or min_admission_age between 0 and 18)
    and (max_admission_age is null or max_admission_age between 0 and 18)
    and (
      min_admission_age is null
      or max_admission_age is null
      or min_admission_age <= max_admission_age
    )
  );

comment on column public.venue_family_metadata.min_admission_age is
  'Youngest age ADMITTED, in years. A child below this is turned away. Distinct from '
  'min_recommended_age, which is advice and never excludes. Null means unknown, which never excludes.';

comment on column public.venue_family_metadata.max_admission_age is
  'Oldest age ADMITTED, in years, inclusive. A child above this is turned away. Distinct from '
  'max_recommended_age, which is advice and never excludes. Null means unknown, which never excludes.';
