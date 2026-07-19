/* cs-reply/index.ts - Send reply as CS */
import {
  verifyAdminToken,
  createSupabaseClient,
  corsHeaders,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  if (!verifyAdminToken(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      }
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      }
    );
  }

  try {
    const { ticket_id, content } = await req.json();

    if (!ticket_id || !content?.trim()) {
      return new Response(
        JSON.stringify({ error: "ticket_id and content required" }),
        {
          status: 400,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createSupabaseClient();

    const { error: insertError } = await supabase.from("cs_messages").insert({
      ticket_id,
      sender: "cs",
      sender_name: "Customer Service",
      content: content.trim(),
    });

    if (insertError) throw insertError;

    await supabase
      .from("cs_tickets")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", ticket_id);

    return new Response(
      JSON.stringify({ success: true }),
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
