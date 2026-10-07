import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST request required" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const accessToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) throw new Error("Login is required.");

    const { email, phone } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = String(phone || "").trim();
    if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("A valid email address is required.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Required server configuration is missing.");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData.user) throw new Error("Your login session is invalid or expired.");

    const authEmail = String(userData.user.email || "").trim().toLowerCase();
    if (authEmail !== normalizedEmail) throw new Error("The logged-in email does not match this account.");

    // First, resolve an existing customer by email. This keeps the customer
    // login email + password only and avoids asking for phone during login.
    const { data: existing, error: lookupError } = await supabase
      .from("duty_customers")
      .select("id, email, phone, token_balance")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (lookupError) throw new Error("Unable to open your ZuuTrans account.");

    if (existing) {
      return new Response(JSON.stringify({
        success: true,
        customer_id: existing.id,
        email: existing.email,
        phone: existing.phone || "",
        token_balance: Number(existing.token_balance) || 0
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If an older Auth account has no duty_customers row, use the phone stored
    // in Auth metadata if available. Never invent a phone number.
    const metadataPhone = String(userData.user.user_metadata?.phone || "").trim();
    const phoneToCreate = normalizedPhone || metadataPhone;
    if (!phoneToCreate || phoneToCreate.replace(/\D/g, "").length < 8) {
      throw new Error("Your ZuuTrans customer record needs a phone number. Please contact ZuuTrans support.");
    }

    const { data: created, error: createError } = await supabase
      .from("duty_customers")
      .insert({ auth_user_id: userData.user.id, email: normalizedEmail, phone: phoneToCreate, token_balance: 0 })
      .select("id, email, phone, token_balance")
      .single();

    if (createError || !created) throw new Error("Unable to create your ZuuTrans duty-check account.");

    return new Response(JSON.stringify({
      success: true,
      customer_id: created.id,
      email: created.email,
      phone: created.phone,
      token_balance: Number(created.token_balance) || 0
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("duty-account error", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unexpected error." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
