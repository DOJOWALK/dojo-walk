import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Admin sign-in required" }, 401);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Server authentication is not configured" }, 500);
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: caller, error: authError } = await auth.auth.getUser(token);
  if (authError || !caller.user) return json({ error: "Invalid or expired admin session" }, 401);
  const { data: profile, error: profileError } = await db.from("profiles").select("role").eq("id", caller.user.id).maybeSingle();
  if (profileError) return json({ error: "Could not verify admin permissions" }, 500);
  if (profile?.role !== "admin") return json({ error: "Admin access required" }, 403);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request body" }, 400);
  const input = body as Record<string, unknown>;
  const walkerId = typeof input.walker_id === "string" ? input.walker_id.trim() : "";
  const status = input.account_status;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(walkerId)) return json({ error: "Valid walker id is required" }, 400);
  if (!["active", "on_hold", "suspended", "deactivated"].includes(String(status))) return json({ error: "Invalid account status" }, 400);
  const { data: walker, error: walkerError } = await db.from("walkers").select("id,account_status").eq("id", walkerId).maybeSingle();
  if (walkerError) return json({ error: "Could not verify walker account" }, 500);
  if (!walker) return json({ error: "Walker account not found" }, 404);
  if (walker.account_status === "deactivated" && status !== "deactivated") return json({ error: "Deactivated Walker accounts cannot be reactivated. Create a new account if needed." }, 409);
  if (status !== "active") {
    const { count, error: activeWalkError } = await db.from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("walker_id", walkerId)
      .eq("status", "in_progress");
    if (activeWalkError) return json({ error: "Could not check the Walker's active walk" }, 500);
    if ((count ?? 0) > 0) return json({ error: "पहले Walker की चल रही walk पूरी करवाएँ, फिर account hold या बंद करें।" }, 409);
  }
  const { error: updateError } = await db.from("walkers").update({ account_status: status, status_changed_at: new Date().toISOString() }).eq("id", walkerId);
  if (updateError) return json({ error: "Walker status could not be updated" }, 500);
  return json({ walker_id: walkerId, account_status: status });
});
