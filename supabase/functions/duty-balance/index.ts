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
    const { email, phone } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = String(phone || "").trim();
    if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("A valid email address is required.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Required server configuration is missing.");

    const accessToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) throw new Error("Login is required.");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) throw new Error("Your login session is invalid or expired.");
    if (String(authData.user.email || "").trim().toLowerCase() !== normalizedEmail) throw new Error("The logged-in email does not match this account.");

    const { data: customer, error } = await supabase
      .from("duty_customers")
      .select("id, email, phone, token_balance")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (error) throw new Error("Unable to check the token wallet.");
    if (!customer) {
      return new Response(JSON.stringify({ success: false, error: "No ZuuTrans duty-check account was found for that email address." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (normalizedPhone && customer.phone && String(customer.phone).trim() !== normalizedPhone) {
      return new Response(JSON.stringify({ success: false, error: "The phone number on this ZuuTrans account does not match." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      email: customer.email,
      phone: customer.phone || "",
      token_balance: Number(customer.token_balance) || 0
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("duty-balance error", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unexpected error." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
