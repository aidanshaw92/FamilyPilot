-- Record the HTTP status of a source fetch as a number.
--
-- The refresh lifecycle has to tell a 404 (the page has gone; re-reading will not help) from a
-- 503 (the server is having a moment) when deciding whether a claim has earned grace. Until now
-- that distinction existed only inside the free-text `error` column as "HTTP 404" / "HTTP 503",
-- and classifying on a substring of a human-facing message would silently change behaviour the
-- day that wording changed.
--
-- Additive and nullable: every existing row keeps its meaning, and a null simply means the
-- attempt never received an HTTP response at all, which is itself treated as transient.
alter table public.venue_source_evidence
  add column if not exists http_status integer;

comment on column public.venue_source_evidence.http_status is
  'HTTP status of the fetch attempt, or null when no response was received. Used to classify a refresh failure as transient or permanent without parsing the error text.';
