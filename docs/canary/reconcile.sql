-- Predicted vs actual for the nearby-food production canary.
--
-- Run BEFORE the canary to capture the baseline, and again AFTER. The point of writing it down is that
-- "predicted -> actual" has to be a comparison of two measurements, not a measurement against a memory.
--
-- PREDICTED, for five venue opens on a cold cache:
--   Overpass requests      5   (one per anchor; the provider retries at most once, narrower)
--   Google billable units  0   in every scope -- the food path holds no Google client at all
--   distance_matrix rows   0   the journeys scope is refused unless enabled by name
--   nearby-food cache rows 5   one per anchor, keyed on coordinates rounded to ~11m
--
-- A second pass over the same five anchors predicts 0 further Overpass requests and the same 5 rows,
-- because the first pass wrote them.

select 'google units today, by scope' as metric,
       coalesce(string_agg(scope || '=' || calls, ', ' order by scope), 'none') as value
from google_places_usage
where usage_day = current_date

union all
select 'distance_matrix rows ever (any day, any env)',
       count(*)::text
from google_places_usage
where sku = 'distance_matrix'

union all
select 'nearby-food cache rows',
       count(*)::text
from place_search_cache
where cache_key like 'nearby-food%'

union all
select 'nearby-food cache rows, with their anchors',
       coalesce(
         string_agg(
           split_part(cache_key, '|', 3) || ',' || split_part(cache_key, '|', 4)
             || ' (' || coalesce(jsonb_array_length(payload -> 'candidates'), 0) || ' candidates)',
           '; ' order by cache_key
         ),
         'none'
       )
from place_search_cache
where cache_key like 'nearby-food%'

union all
select 'nearby-food rows recording a billable call (must be 0)',
       count(*)::text
from place_search_cache
where cache_key like 'nearby-food%' and billable_calls > 0

union all
select 'nearby-food rows attributed to a provider other than osm (must be 0)',
       count(*)::text
from place_search_cache
where cache_key like 'nearby-food%' and provider <> 'osm'

union all
-- The served-data baseline, so the canary can show it disturbed nothing a parent reads.
select 'served claims', count(*)::text from venue_claims
where status = 'active' and valid_until >= current_date and approved_by <> 'ai_auto_approved'

union all
select 'distinct venues served', count(distinct familypilot_place_id)::text from venue_claims
where status = 'active' and valid_until >= current_date and approved_by <> 'ai_auto_approved'

union all
select 'failed enrichment jobs', count(*)::text from venue_enrichment_jobs where status = 'failed';
