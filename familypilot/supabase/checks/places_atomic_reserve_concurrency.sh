#!/usr/bin/env bash
# Proves public.reserve_google_places_usage() is a ceiling under real concurrency: many separate database
# connections, started together, race for the last units, and the number allowed must equal the cap exactly.
# Uses the standard PG* environment variables. Writes only rows for environment 'concurrency-test'.
# At most 60 connections are open at once, under PostgreSQL's default limit of 100.
#
#   1. total cap       200 callers across 4 scopes, per-scope cap 30, total cap 50  -> exactly 50 allowed, no scope above 30
#   2. scope cap only  100 callers on one scope, cap 50                              -> exactly 50 allowed
#   3. element units   20 callers of 25 units each, cap 100                          -> exactly 4 allowed (a ceiling, not a trigger)
#   4. month cap       100 callers, 30 units already used earlier this month, month cap 80  -> exactly 50 allowed
#   every phase       the stored sum equals what was allowed (a refusal never counts)
#   control           the same race using read-then-write in separate statements -> reported, NOT asserted. It is
#                     expected to overshoot; it shows that the race this function exists to close is real.
set -euo pipefail
ENVNAME=concurrency-test
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
q() { psql -v ON_ERROR_STOP=1 -Atq -v client_min_messages=warning "$@"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

reset() { q -c "delete from public.google_places_usage where environment='$ENVNAME' and usage_day >= date_trunc('month', current_date)::date"; }
stored_total() { q -c "select coalesce(sum(calls),0) from public.google_places_usage where environment='$ENVNAME' and usage_day=current_date"; }
stored_scope_max() { q -c "select coalesce(max(s),0) from (select sum(calls) s from public.google_places_usage where environment='$ENVNAME' and usage_day=current_date group by scope) t"; }

# One caller: reserve once, print the verdict on its own line.
cat > "$WORK/caller.sh" <<'CALLER'
#!/usr/bin/env bash
i=$1; units=$2; scap=$3; tcap=$4; shift 4
scopes=("$@"); s=${scopes[$(( i % ${#scopes[@]} ))]}
mcap=${MONTH_CAP:-null}
psql -Atq -c "select public.reserve_google_places_usage('sku_$s', '$s', '$ENVNAME', $units, $scap, $tcap, $mcap)->>'allowed'" || echo error
CALLER
cat > "$WORK/naive.sh" <<'NAIVE'
#!/usr/bin/env bash
used=$(psql -Atq -c "select coalesce(sum(calls),0) from public.google_places_usage where environment='$ENVNAME' and usage_day=current_date")
if [ "$used" -lt 50 ]; then psql -Atq -c "select public.record_google_places_usage('sku_c','control','$ENVNAME',1)" >/dev/null && echo true; else echo false; fi
NAIVE
chmod +x "$WORK"/*.sh
export ENVNAME

# race <callers> <units> <scope_cap|null> <total_cap|null> <scope...>  -> prints how many were allowed
race() {
  local n=$1 units=$2 scap=$3 tcap=$4; shift 4
  seq 1 "$n" | xargs -P 60 -I{} "$WORK/caller.sh" {} "$units" "$scap" "$tcap" "$@" > "$WORK/out" || true
  if grep -q '^error$' "$WORK/out"; then fail "a caller could not reach the database"; fi
  grep -c '^true$' "$WORK/out" || true
}

echo "== 1. total cap: 200 callers, 4 scopes, scope cap 30, total cap 50"
reset; allowed=$(race 200 1 30 50 details discovery refresh photos)
echo "allowed=$allowed stored=$(stored_total) max_scope=$(stored_scope_max)"
[ "$allowed" = 50 ] || fail "expected exactly 50 allowed, got $allowed"
[ "$(stored_total)" = 50 ] || fail "stored total is not 50"
[ "$(stored_scope_max)" -le 30 ] || fail "a scope exceeded its cap of 30"

echo "== 2. scope cap only: 100 callers, one scope, cap 50"
reset; allowed=$(race 100 1 50 null details)
echo "allowed=$allowed stored=$(stored_total)"
[ "$allowed" = 50 ] || fail "expected exactly 50 allowed, got $allowed"
[ "$(stored_total)" = 50 ] || fail "stored total is not 50"

echo "== 3. element units: 20 callers x 25 units, cap 100"
reset; allowed=$(race 20 25 100 null journeys)
echo "allowed=$allowed stored=$(stored_total)"
[ "$allowed" = 4 ] || fail "expected exactly 4 allowed, got $allowed"
[ "$(stored_total)" = 100 ] || fail "stored total is not 100"

echo "== 4. month cap: 100 callers, 30 already used on the 1st of the month, month cap 80"
reset
q -c "insert into public.google_places_usage (usage_day, sku, scope, environment, calls) values (date_trunc('month', current_date)::date, 'sku_prior', 'prior', '$ENVNAME', 30) on conflict (usage_day, sku, scope, environment) do update set calls = 30"
allowed=$(MONTH_CAP=80 race 100 1 null null details)
month_total=$(q -c "select coalesce(sum(calls),0) from public.google_places_usage where environment='$ENVNAME' and usage_day >= date_trunc('month', current_date)::date")
echo "allowed=$allowed month_total=$month_total"
[ "$allowed" = 50 ] || fail "expected exactly 50 allowed under the month cap, got $allowed"
[ "$month_total" = 80 ] || fail "month total is not 80"

echo "== control (informational, not asserted): read-then-write, 100 callers, cap 50"
reset
seq 1 100 | xargs -P 60 -I{} "$WORK/naive.sh" > "$WORK/naive.out" || true
echo "naive read-then-write allowed=$(grep -c '^true$' "$WORK/naive.out" || true) stored=$(stored_total) (cap 50)"
reset
echo "PASS: reserve_google_places_usage is exact under concurrency"
