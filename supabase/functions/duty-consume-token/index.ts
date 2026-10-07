import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return new Response(JSON.stringify({success:false,error:"POST request required"}),{status:405,headers:{...corsHeaders,"Content-Type":"application/json"}});
  try{
    const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
    if(!token) throw new Error("Login is required.");
    const {email}=await req.json().catch(()=>({}));
    const normalizedEmail=String(email||"").trim().toLowerCase();
    if(!normalizedEmail||!normalizedEmail.includes("@")) throw new Error("A valid email address is required.");
    const supabaseUrl=Deno.env.get("SUPABASE_URL"); const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!supabaseUrl||!serviceRoleKey) throw new Error("Required server configuration is missing.");
    const admin=createClient(supabaseUrl,serviceRoleKey);
    const {data:userData,error:userError}=await admin.auth.getUser(token);
    if(userError||!userData.user) throw new Error("Your login session is invalid or expired.");
    if(String(userData.user.email||"").trim().toLowerCase()!==normalizedEmail) throw new Error("The logged-in email does not match this account.");
    const {data:result,error:rpcError}=await admin.rpc("consume_duty_token",{p_email:normalizedEmail});
    if(rpcError) throw new Error("Unable to use a duty-check token. Please contact ZuuTrans support.");
    const row=Array.isArray(result)?result[0]:result;
    if(!row||row.success!==true){
      if(row?.error==="INSUFFICIENT_TOKENS") throw new Error("You do not have enough duty-check tokens. Please buy a token package first.");
      if(row?.error==="CUSTOMER_NOT_FOUND") throw new Error("No ZuuTrans duty-check account was found for this email address.");
      throw new Error("Unable to use a duty-check token.");
    }
    return new Response(JSON.stringify({success:true,token_balance:Number(row.token_balance)||0}),{status:200,headers:{...corsHeaders,"Content-Type":"application/json"}});
  }catch(error){
    console.error("duty-consume-token error",error);
    return new Response(JSON.stringify({success:false,error:error instanceof Error?error.message:"Unexpected error."}),{status:400,headers:{...corsHeaders,"Content-Type":"application/json"}});
  }
});
