/**
 * Who approved a claim, and whether that was a person.
 *
 * An earlier revision asked this question as `approvedBy !== 'ai_auto_approved'`. That is a
 * denylist of one, and this repo already runs a second automatic approver (`source_evidence_auto_v2`,
 * which `ai-draft-mapper.js` records as `humanReviewed: false`) plus an unattended default actor
 * (`enrichment-admin`, what the enrichment API stamps when a request names no reviewer). Both
 * passed that test. For the only fact allowed to remove a venue from a parent's results, "not one
 * known robot" is not a human-review rule.
 *
 * So the rule here is POSITIVE: a human approval is an identity in the `human:` namespace, and
 * nothing else is one. Two consequences worth stating plainly rather than discovering later:
 *
 * - A new automated actor added tomorrow cannot gate, because it will not be in the namespace.
 *   Nothing has to remember to add it to a list.
 * - Until an editor identity is stamped as `human:<id>`, NO age-policy claim can gate. That is
 *   the fail-open direction: venues stay visible. The producer of these claims (P0-B3) stamps the
 *   namespace at the point a person actually approves the policy, via `humanApprover()`.
 *
 * What this cannot do is prove the person. The enrichment API is behind one shared admin token,
 * so a caller holding that token can assert any reviewer string it likes. This rule stops an
 * automated path inside this codebase from gating by accident; it is not an authentication
 * control, and nothing here should be read as one.
 */

const HUMAN_APPROVER_PREFIX = 'human:';

/** The automatic claim approver used by the source-evidence auto-publish path. */
const SOURCE_EVIDENCE_AUTO_APPROVER = 'source_evidence_auto_v2';

/** The legacy automatic approver. Claims carrying it are distrusted repo-wide. */
const AI_AUTO_APPROVER = 'ai_auto_approved';

/** What the enrichment API stamps when a request names no reviewer. A token, not a person. */
const DEFAULT_UNATTENDED_APPROVER = 'enrichment-admin';

/**
 * Every approver identity in this codebase that is NOT a person.
 *
 * Kept so tests can assert none of them gates, and so a reader can see the whole cast at once.
 * The gate does not consult it -- `isHumanApprover` is positive and would reject an unlisted
 * robot anyway -- but a membership test here is the cheap way to notice a new one.
 */
const SYSTEM_APPROVERS = new Set([
  AI_AUTO_APPROVER,
  SOURCE_EVIDENCE_AUTO_APPROVER,
  DEFAULT_UNATTENDED_APPROVER,
]);

/** Stamp a reviewer identity as human-approved. The only way to produce a gating approver. */
function humanApprover(reviewerId) {
  const id = String(reviewerId ?? '').trim();
  if (!id) return null;
  if (id.startsWith(HUMAN_APPROVER_PREFIX)) return id;
  if (SYSTEM_APPROVERS.has(id)) return null; // a robot cannot be promoted by wrapping its name
  return `${HUMAN_APPROVER_PREFIX}${id}`;
}

/** Whether an `approved_by` value names a person. Positive test; everything else is not one. */
function isHumanApprover(approvedBy) {
  if (typeof approvedBy !== 'string') return false;
  if (!approvedBy.startsWith(HUMAN_APPROVER_PREFIX)) return false;
  const id = approvedBy.slice(HUMAN_APPROVER_PREFIX.length).trim();
  if (!id) return false;
  // Defence in depth: a system actor must not reach a human verdict by wearing the namespace.
  return !SYSTEM_APPROVERS.has(id);
}

module.exports = {
  HUMAN_APPROVER_PREFIX,
  SOURCE_EVIDENCE_AUTO_APPROVER,
  AI_AUTO_APPROVER,
  DEFAULT_UNATTENDED_APPROVER,
  SYSTEM_APPROVERS,
  humanApprover,
  isHumanApprover,
};
