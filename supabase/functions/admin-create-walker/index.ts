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

  const authorization = req.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Admin sign-in required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Server authentication is not configured" }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid or expired admin session" }, 401);

  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (profileError) return json({ error: "Could not verify admin permissions" }, 500);
  if (callerProfile?.role !== "admin") return json({ error: "Admin access required" }, 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Invalid request body" }, 400);
  }

  const input = body as Record<string, unknown>;
  const fullName = typeof input.full_name === "string" ? input.full_name.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const experience = Number(input.experience_years);
  const bio = typeof input.bio === "string" ? input.bio.trim() : "";
  const localAddress = typeof input.local_address === "string" ? input.local_address.trim() : "";
  const permanentAddress = typeof input.permanent_address === "string" ? input.permanent_address.trim() : "";
  const serviceAreas = Array.isArray(input.service_areas)
    ? [...new Set(input.service_areas.filter((area): area is string => typeof area === "string").map((area) => area.trim()).filter(Boolean))]
    : [];

  if (fullName.length < 2 || fullName.length > 100) return json({ error: "Name must be 2 to 100 characters" }, 400);
  if (!/^\+91[6-9]\d{9}$/.test(phone)) return json({ error: "Enter a valid Indian mobile number in +91 format" }, 400);
  if (!Number.isFinite(experience) || experience < 0 || experience > 60) return json({ error: "Experience must be between 0 and 60 years" }, 400);
  if (bio.length > 1000) return json({ error: "Bio must be 1000 characters or fewer" }, 400);
  if (localAddress.length < 5 || localAddress.length > 500) return json({ error: "Enter a valid local address (5 to 500 characters)" }, 400);
  if (permanentAddress.length < 5 || permanentAddress.length > 500) return json({ error: "Enter a valid permanent address (5 to 500 characters)" }, 400);
  if (serviceAreas.length < 1 || serviceAreas.length > 10 || serviceAreas.some((area) => area.length > 80)) {
    return json({ error: "Enter 1 to 10 service areas (each up to 80 characters)" }, 400);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    phone,
    phone_confirm: false,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    return json({ error: createError?.message || "Walker account could not be created" }, 400);
  }

  const walkerId = created.user.id;
  const { error: updateProfileError } = await adminClient.rpc("admin_prepare_walker_profile", {
    p_admin_id: authData.user.id,
    p_walker_id: walkerId,
    p_full_name: fullName,
    p_phone: phone,
  });

  if (updateProfileError) {
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(walkerId);
    return json({
      error: cleanupError
        ? "Walker profile could not be prepared and automatic cleanup could not be confirmed; contact an administrator"
        : "Walker profile could not be prepared; account creation was rolled back",
    }, 500);
  }

  const { error: walkerError } = await adminClient.from("walkers").insert({
    id: walkerId,
    service_areas: serviceAreas,
    experience_years: experience,
    bio: bio || null,
    verification_status: "approved",
    approved_at: new Date().toISOString(),
  });

  if (walkerError) {
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(walkerId);
    return json({
      error: cleanupError
        ? "Walker record could not be created and automatic cleanup could not be confirmed; contact an administrator"
        : "Walker record could not be created; account creation was rolled back",
    }, 500);
  }

  const { error: privateDetailsError } = await adminClient.from("walker_private_details").insert({
    walker_id: walkerId,
    local_address: localAddress,
    permanent_address: permanentAddress,
  });

  if (privateDetailsError) {
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(walkerId);
    return json({
      error: cleanupError
        ? "Walker private details could not be saved and automatic cleanup could not be confirmed; contact an administrator"
        : "Walker private details could not be saved; account creation was rolled back",
    }, 500);
  }

  return json({
    walker_id: walkerId,
    full_name: fullName,
    phone,
    account_status: "active",
    phone_verification_required: true,
  }, 201);
});
