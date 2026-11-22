import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Admin sign-in required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Server authentication is not configured" }, 500);

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid or expired admin session" }, 401);

  const { data: callerProfile, error: callerError } = await adminClient
    .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (callerError) return json({ error: "Could not verify admin permissions" }, 500);
  if (callerProfile?.role !== "admin") return json({ error: "Admin access required" }, 403);

  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "Invalid request body" }, 400);

  const body = input as Record<string, unknown>;
  const walkerId = typeof body.walker_id === "string" ? body.walker_id.trim() : "";
  const decision = body.decision;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(walkerId)) {
    return json({ error: "Valid walker id is required" }, 400);
  }
  if (decision !== "approved" && decision !== "rejected") return json({ error: "Decision must be approved or rejected" }, 400);

  const { data: walkerProfile, error: walkerProfileError } = await adminClient
    .from("profiles").select("role").eq("id", walkerId).maybeSingle();
  if (walkerProfileError) return json({ error: "Could not verify walker profile" }, 500);
  if (walkerProfile?.role !== "walker") return json({ error: "Walker profile not found" }, 404);

  if (decision === "approved") {
    const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(walkerId);
    if (authUserError || !authUser.user) return json({ error: "Could not verify walker phone status" }, 500);
    if (!authUser.user.phone_confirmed_at) {
      return json({ error: "Walker must verify the registered mobile number by OTP before approval" }, 409);
    }
  }

  const { data: updated, error: updateError } = await adminClient.from("walkers")
    .update({
      verification_status: decision,
      approved_at: decision === "approved" ? new Date().toISOString() : null,
    })
    .eq("id", walkerId)
    .eq("verification_status", "pending")
    .select("id")
    .maybeSingle();

  if (updateError) return json({ error: "Walker status could not be updated" }, 500);
  if (!updated) return json({ error: "Walker is no longer pending review" }, 409);

  return json({ walker_id: walkerId, verification_status: decision });
});
