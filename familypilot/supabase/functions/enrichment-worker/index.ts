import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Job = {
  id: string;
  familypilot_place_id: string;
  mode: "generate" | "regenerate";
  dispatch_token: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Worker environment is incomplete" }, 503);

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const scheduleSecret = req.headers.get("x-worker-schedule-secret") ?? "";
  const { data: scheduleAllowed, error: scheduleError } = await supabase.rpc(
    "verify_enrichment_worker_schedule",
    { p_secret: scheduleSecret },
  );
  if (scheduleError || scheduleAllowed !== true) {
    return json({ error: "Unauthorized scheduler" }, 401);
  }

  const { data, error: claimError } = await supabase
    .rpc("claim_next_venue_enrichment_job")
    .maybeSingle<Job>();
  if (claimError) return json({ error: claimError.message }, 500);
  if (!data) return json({ ok: true, processed: 0 });

  try {
    const response = await fetch(
      "https://family-pilot-seven.vercel.app/api/enrichment?action=automation-run",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: data.familypilot_place_id,
          jobId: data.id,
          dispatchToken: data.dispatch_token,
          regenerate: data.mode === "regenerate",
        }),
        signal: AbortSignal.timeout(50000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof payload?.error === "string"
        ? payload.error : `FamilyPilot API returned HTTP ${response.status}`);
    }

    const { error: completeError } = await supabase.rpc(
      "complete_venue_enrichment_job", { p_job_id: data.id },
    );
    if (completeError) throw completeError;

    console.log("enrichment job completed", {
      jobId: data.id, venueId: data.familypilot_place_id, draftId: payload?.draftId,
    });
    return json({
      ok: true, processed: 1, jobId: data.id,
      venueId: data.familypilot_place_id, draftId: payload?.draftId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    console.error("enrichment job failed", {
      jobId: data.id, venueId: data.familypilot_place_id, error: message,
    });
    await supabase.rpc("fail_venue_enrichment_job", {
      p_job_id: data.id, p_error: message,
    });
    return json({
      ok: false, processed: 1, jobId: data.id,
      venueId: data.familypilot_place_id, error: message,
    }, 500);
  }
});
