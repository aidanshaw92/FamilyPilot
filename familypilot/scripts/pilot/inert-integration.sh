#!/usr/bin/env bash
# Builds the branch that can merge #189 and #190 WITHOUT publishing a single unreviewed pilot fact.
#
#   scripts/pilot/inert-integration.sh pilot/integration-inert
#
# Run from the repository root on pilot/working-product. It branches from the current commit and puts these five files back to their
# state on main. They are the only places where the pilot's proposed facts ship as code, so with them reverted:
#   - Home, Explore, Venue Detail and the planner give the same answers as main for every pilot household, flags unset
#     (checked byte for byte with src/__tests__/main-parity.analysis.test.ts: 11 households x 2 evidence states);
#   - the full test suite passes except the three "after build" static-route checks that need a build.
# Nothing is pushed and no pull request is opened by this script.
set -euo pipefail
branch="${1:?usage: inert-integration.sh <new-branch-name>}"
git fetch origin main
git checkout -b "$branch"
git checkout origin/main -- \
  familypilot/src/data/reviewed-activity-evidence.ts \
  familypilot/src/data/reviewed-admission-claims.ts \
  familypilot/src/__tests__/excellent-activity-evidence.test.ts \
  familypilot/src/__tests__/reviewed-admission-claims.test.ts \
  familypilot/src/__tests__/pricing-release-check.test.ts
git commit -m "Integration without unreviewed pilot facts: reviewed activity and admission data and their count tests are main's"
echo "Created $branch. Reviewed entries are added later, one pull request each, after a person has decided them."
