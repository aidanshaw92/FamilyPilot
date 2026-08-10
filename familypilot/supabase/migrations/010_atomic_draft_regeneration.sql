-- FamilyPilot — atomic pending enrichment draft replacement
-- Regeneration must either replace the pending draft completely or leave the old one untouched.

CREATE OR REPLACE FUNCTION public.replace_pending_venue_enrichment_draft(
  p_familypilot_place_id TEXT,
  p_external_id TEXT,
  p_draft_json JSONB,
  p_model TEXT,
  p_generated_at TIMESTAMPTZ,
  p_source_context JSONB,
  p_confidence_json JSONB,
  p_evidence_status TEXT,
  p_token_usage JSONB,
  p_estimated_cost_usd NUMERIC,
  p_updated_at TIMESTAMPTZ
)
RETURNS public.venue_enrichment_drafts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  replacement public.venue_enrichment_drafts;
BEGIN
  -- Serialise replacements per venue, including the no-existing-draft case.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_familypilot_place_id, 0));

  UPDATE public.venue_enrichment_drafts
  SET status = 'superseded',
      updated_at = p_updated_at
  WHERE familypilot_place_id = p_familypilot_place_id
    AND status = 'pending_review';

  INSERT INTO public.venue_enrichment_drafts (
    familypilot_place_id,
    external_id,
    draft_json,
    model,
    generated_at,
    source_context,
    confidence_json,
    evidence_status,
    status,
    token_usage,
    estimated_cost_usd,
    updated_at
  )
  VALUES (
    p_familypilot_place_id,
    p_external_id,
    p_draft_json,
    p_model,
    p_generated_at,
    COALESCE(p_source_context, '{}'::jsonb),
    COALESCE(p_confidence_json, '{}'::jsonb),
    p_evidence_status,
    'pending_review',
    COALESCE(p_token_usage, '{}'::jsonb),
    p_estimated_cost_usd,
    p_updated_at
  )
  RETURNING * INTO replacement;

  RETURN replacement;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_pending_venue_enrichment_draft(
  TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ, JSONB, JSONB, TEXT, JSONB, NUMERIC, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.replace_pending_venue_enrichment_draft(
  TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ, JSONB, JSONB, TEXT, JSONB, NUMERIC, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.replace_pending_venue_enrichment_draft(
  TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ, JSONB, JSONB, TEXT, JSONB, NUMERIC, TIMESTAMPTZ
) IS 'Atomically supersedes any pending draft and inserts its replacement; service-role only.';
