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
    const { email, password, full_name, phone } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPhone = String(phone || "").trim();
    const name = String(full_name || "").trim();

    if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("A valid email address is required.");
    if (!normalizedPhone || normalizedPhone.replace(/\D/g, "").length < 8) throw new Error("A valid phone number is required.");
    if (!name) throw new Error("Your full name is required.");
    if (String(password || "").length < 6) throw new Error("Password must be at least 6 characters.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Required server configuration is missing.");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Create the Auth user as already confirmed. This avoids making customers
    // wait for an email that may never arrive from the default Supabase sender.
    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: name, phone: normalizedPhone }
    });

    if (createError || !createdUser.user) {
      const msg = createError?.message || "Unable to create your account.";
      if (/already registered|already exists/i.test(msg)) {
        throw new Error("An account with this email already exists. Please use Log In with the password you created.");
      }
      throw new Error(msg);
    }

    const { error: customerError } = await supabase
      .from("duty_customers")
      .insert({ auth_user_id: createdUser.user.id, email: normalizedEmail, phone: normalizedPhone, token_balance: 0 });

    if (customerError) {
      // Do not leave an Auth account behind if the ZuuTrans customer record
      // could not be created.
      await supabase.auth.admin.deleteUser(createdUser.user.id);
      throw new Error("Your account could not be completed. Please try again.");
    }

    return new Response(JSON.stringify({ success: true, token_balance: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("duty-signup error", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unexpected error." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
