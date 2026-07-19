/* _shared/auth.ts - Admin token verification */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_TOKEN = "notara_cs_admin_2024";

export function verifyAdminToken(req: Request): boolean {
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
  return auth === ADMIN_TOKEN;
}

export function createSupabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}
