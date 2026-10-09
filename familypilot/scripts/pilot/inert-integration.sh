#!/usr/bin/env bash
# Builds the branch that can merge the pilot's PRODUCT CODE without publishing a single unreviewed pilot fact (PR #191).
#
#   familypilot/scripts/pilot/inert-integration.sh pilot/integration-inert
#
# Run from the repository root on pilot/working-product. It branches from the current commit and, on the new branch:
#   1. puts back to main's version the two shipped data files where the pilot's proposed activity and admission facts would ship as
#      code, and the three tests that count their entries (keeping one type narrowing the new "range" price state needs);
#   2. removes everything that is pilot tooling rather than product: docs/, familypilot/scripts/, .github/, and the tests that read them.
# What is left is src/, app/ and server/ with the product tests. With flags unset and no new claims it behaves exactly as main does
# (checked byte for byte with src/__tests__/main-parity.analysis.test.ts: 11 households x 2 evidence states).
# Then squash it onto main so the pilot's history (and the proposed facts in it) is not carried:
#   git commit-tree HEAD^{tree} -p origin/main -m "<message>"
# Nothing is pushed and no pull request is opened by this script.
set -euo pipefail
branch="${1:?usage: inert-integration.sh <new-branch-name>}"
git fetch origin main
git checkout -b "$branch"
restore() { # restore main's version of a path, or remove it if main does not have it
  for f in "$@"; do
    if git cat-file -e "origin/main:$f" 2>/dev/null; then git checkout origin/main -- "$f"; else git rm -q -f --ignore-unmatch "$f"; fi
  done
}
restore \
  familypilot/src/data/reviewed-activity-evidence.ts \
  familypilot/src/data/reviewed-admission-claims.ts \
  familypilot/src/__tests__/excellent-activity-evidence.test.ts \
  familypilot/src/__tests__/reviewed-admission-claims.test.ts \
  familypilot/src/__tests__/pricing-release-check.test.ts
# main's test does not know the new "range" estimate state; this one line is the only difference from main.
sed -i "s/      if (e.state === 'unknown') continue;/      if (e.state === 'unknown' || e.state === 'range') continue;/" familypilot/src/__tests__/pricing-release-check.test.ts
# Pilot tooling and the tests that read it stay on the draft PRs (#189, #190).
mapfile -t tooling < <(git diff --name-only origin/main...HEAD -- docs familypilot/scripts .github \
  familypilot/src/__tests__/pilot-ranking.analysis.test.ts familypilot/src/__tests__/pilot-readiness.test.ts \
  familypilot/src/__tests__/pilot-review.test.ts familypilot/src/__tests__/pilot-semantic.test.ts \
  familypilot/src/__tests__/review-workflow.test.ts familypilot/src/__tests__/main-parity.analysis.test.ts \
  familypilot/src/__tests__/family-fit-v2.analysis.test.ts familypilot/src/__tests__/publish-batch.test.ts familypilot/src/__tests__/beta-five-readiness.test.ts familypilot/src/__tests__/live-readiness.test.ts familypilot/src/__tests__/packc-score.test.ts familypilot/src/__tests__/final-manifest.test.ts familypilot/src/__tests__/packc-ai-verification.test.ts familypilot/src/__tests__/google-cap-enforcement.analysis.test.ts)
restore "${tooling[@]}"
git add -A
git commit -m "Integration without unreviewed pilot facts or pilot tooling: product code only"
echo "Created $branch."
