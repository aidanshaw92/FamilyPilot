-- PROPOSED. NOT APPLIED. NOT in the migrations folder, so nothing will run it.
--
-- Open-data ledger: a provenance record per import batch, a separate table for open-data places, and a link table that joins an
-- open-data place to a stored Google place by identifier only. Purely additive: no existing table, column, constraint, policy or row
-- is changed. See docs/LEDGER_MIGRATION_PROPOSAL.md for the reasons, the rollback and the licensing notes.
--
-- Run only after approval, inside a transaction, on a copy first.

begin;

-- 1. One row per import batch: where the data came from and on what terms.
create table public.place_import_batches (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,                          -- e.g. 'osm-geofabrik-greater-london'
  provider        text not null
                  check (provider in ('osm', 'os_open_greenspace', 'wikidata', 'mapping_museums', 'borough_open_data')),
  source_version  text not null,                          -- the file date or release id the rows were read from
  source_url      text not null,
  licence         text not null check (licence in ('ODbL-1.0', 'OGL-3.0', 'CC0-1.0', 'CC-BY-4.0')),
  licence_url     text not null,
  attribution     text not null check (length(btrim(attribution)) > 0),   -- the exact words the app must show
  share_alike     boolean not null,                       -- true when derivatives must be offered on the same terms (ODbL)
  retrieved_at    timestamptz not null,
  retrieved_by    text not null,                          -- the script and its git commit
  row_count       integer not null check (row_count >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  constraint share_alike_follows_licence check ((licence = 'ODbL-1.0') = share_alike)
);

-- 2. The places. Open-data content only: never a Google value, and no personal contact detail (no phone, no email).
create table public.open_data_places (
  id                    uuid primary key default gen_random_uuid(),
  familypilot_place_id  text not null unique,             -- 'fp-osm-way-123', 'fp-os-gs-<id>', 'fp-wd-Q123'
  import_batch_id       uuid not null references public.place_import_batches (id) on delete restrict,
  source_record_id      text not null,                    -- 'way/123@v7', 'Q4890', an OS id
  name                  text not null check (length(btrim(name)) > 0),
  group_id              text not null check (group_id in ('parks', 'museums', 'animals', 'play', 'attractions')),
  subtype               text,                             -- 'playground', 'trampoline_park', 'city_farm' ...
  lat                   double precision not null check (lat between 51.0 and 52.0),
  lng                   double precision not null check (lng between -1.0 and 0.7),
  website               text,
  address               text,
  source_tags           jsonb not null default '{}'::jsonb,   -- the tags that decided the group or supplied a fact, verbatim
  operating_status      text not null default 'unknown'
                        check (operating_status in ('unknown', 'open_evidenced', 'temporarily_closed', 'permanently_closed')),
  status_evidence       text,                             -- why the status is not 'unknown'; required when it is not
  identity_checked_at   timestamptz not null,             -- the batch's retrieval time
  created_at            timestamptz not null default now(),
  unique (import_batch_id, source_record_id),
  constraint status_needs_evidence check (operating_status = 'unknown' or length(btrim(coalesce(status_evidence, ''))) > 0)
);
create index open_data_places_location on public.open_data_places (lat, lng);
create index open_data_places_group on public.open_data_places (group_id);
create index open_data_places_batch on public.open_data_places (import_batch_id);

-- 3. Join to a stored Google place by identifier only. No Google value is copied across.
create table public.open_data_place_links (
  open_data_place_id    uuid not null references public.open_data_places (id) on delete cascade,
  familypilot_place_id  text not null references public.place_records (familypilot_place_id) on delete cascade,
  match_method          text not null check (match_method in ('name_and_distance', 'website', 'manual')),
  match_confidence      numeric check (match_confidence between 0 and 1),
  reviewed_at           timestamptz,
  reviewed_by           text,
  primary key (open_data_place_id, familypilot_place_id)
);
create index open_data_place_links_place on public.open_data_place_links (familypilot_place_id);

-- 4. Security. The batch ledger and the links are server-only (RLS on, no policy). The places are readable with the public key,
--    because showing them to the public is the point; that public use is what the ODbL notice and export are for.
alter table public.place_import_batches enable row level security;
alter table public.open_data_places enable row level security;
alter table public.open_data_place_links enable row level security;

create policy "Open-data places are publicly readable" on public.open_data_places for select using (true);

revoke all on public.place_import_batches from anon, authenticated;
revoke all on public.open_data_place_links from anon, authenticated;
revoke all on public.open_data_places from anon, authenticated;
grant select on public.open_data_places to anon, authenticated;

commit;
