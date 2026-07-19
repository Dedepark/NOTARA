/* cs-verify/index.ts - Verify admin PIN */
import {
  verifyAdminToken,
  createSupabaseClient,
  corsHeaders,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const { pin } = await req.json();

    if (!pin) {
      return new Response(
        JSON.stringify({ error: "PIN required" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createSupabaseClient();

    const { data, error } = await supabase
      .from("cs_config")
      .select("value")
      .eq("key", "admin_pin")
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: "Config not found" }),
        {
          status: 500,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    if (data.value !== pin) {
      return new Response(
        JSON.stringify({ error: "Invalid PIN" }),
        {
          status: 401,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        token: "notara_cs_admin_2024",
      }),
      {
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      }
    );
  }
});
