/* cs-tickets/index.ts - Get all tickets or messages for a ticket */
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

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);

    const supabase = createSupabaseClient();

    if (pathParts.length > 1) {
      const ticketId = pathParts[pathParts.length - 1];

      const { data: messages, error } = await supabase
        .from("cs_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return new Response(
        JSON.stringify(messages),
        {
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        }
      );
    }

    const { data: tickets, error } = await supabase
      .from("cs_tickets")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const ticketsWithCount = await Promise.all(
      (tickets || []).map(async (ticket) => {
        const { count } = await supabase
          .from("cs_messages")
          .select("*", { count: "exact", head: true })
          .eq("ticket_id", ticket.id);

        const { data: user } = await supabase.auth.admin.getUserById(
          ticket.user_id
        );

        return {
          ...ticket,
          user_name:
            user?.user?.user_metadata?.name ||
            user?.user?.email?.split("@")[0] ||
            "User",
          msg_count: count || 0,
        };
      })
    );

    return new Response(
      JSON.stringify(ticketsWithCount),
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
