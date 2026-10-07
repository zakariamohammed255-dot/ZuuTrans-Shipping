import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "POST request required" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { reference } = await req.json();

    if (!reference) {
      throw new Error("Payment reference is required.");
    }

    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!secret || !supabaseUrl || !serviceRoleKey) {
      throw new Error("Required server configuration is missing.");
    }

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );

    const verify = await verifyRes.json();

    if (!verifyRes.ok || !verify.status || !verify.data) {
      throw new Error("Unable to verify payment with Paystack.");
    }

    const tx = verify.data;

    if (tx.status !== "success") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Payment status: ${tx.status || "pending"}`
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    if (String(tx.currency || "").toUpperCase() !== "GHS") {
      throw new Error("Invalid payment currency.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: payment, error: paymentError } = await supabase
      .from("duty_payments")
      .select("id, customer_id, reference, tokens, amount_ghs, status")
      .eq("reference", reference)
      .maybeSingle();

    if (paymentError || !payment) {
      throw new Error("Payment reference not found.");
    }

    const expectedAmount = Math.round(Number(payment.amount_ghs) * 100);

    if (Number(tx.amount) !== expectedAmount) {
      throw new Error("Payment amount mismatch.");
    }

    const { data: credit, error: creditError } = await supabase.rpc(
      "credit_duty_payment",
      {
        p_reference: reference,
        p_transaction_id: Number(tx.id)
      }
    );

    if (creditError) {
      throw new Error("Unable to credit duty tokens.");
    }

    const { data: customer, error: customerError } = await supabase
      .from("duty_customers")
      .select("token_balance")
      .eq("id", payment.customer_id)
      .single();

    if (customerError || !customer) {
      throw new Error("Unable to read token balance.");
    }

    return new Response(
      JSON.stringify({
        success: true,
        reference,
        token_balance: customer.token_balance,
        credit
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("paystack-status error", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error
          ? error.message
          : "Unexpected server error."
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
