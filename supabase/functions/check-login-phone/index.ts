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
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json({ error: "Login check is not configured" }, 500);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request" }, 400);
  const phone = (body as Record<string, unknown>).phone;
  if (typeof phone !== "string" || !/^\\+91[6-9]\\d{9}$/.test(phone)) return json({ allowed: false });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.from("profiles").select("id,role").eq("phone", phone).maybeSingle();
  if (error) return json({ error: "Could not check registered mobile number" }, 500);
  if (!data || !["customer", "walker", "admin"].includes(data.role)) return json({ allowed: false });
  if (data.role === "walker") {
    const { data: walker, error: walkerError } = await admin.from("walkers").select("account_status").eq("id", data.id).maybeSingle();
    if (walkerError) return json({ error: "Could not check Walker account status" }, 500);
    if (!walker || walker.account_status !== "active") return json({ allowed: false });
  }
  return json({ allowed: true });
});
