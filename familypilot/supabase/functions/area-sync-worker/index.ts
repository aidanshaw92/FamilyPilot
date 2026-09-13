import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Grid of Greater London area points (15km search radius each) so venue
// discovery ("sync") runs on its own instead of needing a manual call per area.
const AREAS: Array<{ label: string; lat: number; lng: number }> = [
  { label: "Central London", lat: 51.5074, lng: -0.1278 },
  { label: "North London (Barnet/Mill Hill)", lat: 51.6132, lng: -0.2384 },
  { label: "North-East London (Enfield)", lat: 51.6538, lng: -0.0799 },
  { label: "East London (Stratford/Ilford)", lat: 51.556, lng: 0.05 },
  { label: "South-East London (Bromley)", lat: 51.4058, lng: 0.0148 },
  { label: "South London (Croydon)", lat: 51.3762, lng: -0.0982 },
  { label: "South-West London (Kingston/Richmond)", lat: 51.4123, lng: -0.3007 },
  { label: "West London (Ealing)", lat: 51.5362, lng: -0.3318 },
  { label: "North-West London (Harrow)", lat: 51.5898, lng: -0.3346 },
  { label: "Outer North-West (Hertfordshire border)", lat: 51.75, lng: -0.34 },
];

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

  const { data: adminToken, error: tokenError } = await supabase.rpc(
    "get_enrichment_admin_token",
  );
  if (tokenError || !adminToken) {
    return json({ error: "Enrichment admin token unavailable" }, 503);
  }

  const results: Array<{ label: string; synced?: number; error?: string }> = [];

  for (const area of AREAS) {
    try {
      const response = await fetch(
        "https://family-pilot-seven.vercel.app/api/enrichment?action=sync",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-enrichment-token": adminToken,
          },
          body: JSON.stringify({ lat: area.lat, lng: area.lng, radiusKm: 15, intent: "explore" }),
          signal: AbortSignal.timeout(20000),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string"
          ? payload.error : `FamilyPilot API returned HTTP ${response.status}`);
      }
      results.push({ label: area.label, synced: payload?.synced ?? 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error";
      results.push({ label: area.label, error: message });
      console.error("area sync failed", { area: area.label, error: message });
    }
  }

  const totalSynced = results.reduce((sum, r) => sum + (r.synced ?? 0), 0);
  console.log("area sync run complete", { totalSynced, areas: results.length });
  return json({ ok: true, totalSynced, results });
});
