/// <reference lib="deno.ns" />
// @ts-expect-error - Deno runtime handles URL imports
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://trollcity.app";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const cors = {
  "Access-Control-Allow-Origin": FRONTEND_URL,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: cors,
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { 
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { data: authUser, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const officerId = authUser.user.id;
    const { streamId } = await req.json();

    if (!streamId) {
      return new Response("Missing streamId", { status: 400 });
    }

    // Update last_activity
    const { error: updateError } = await supabase
      .from("officer_live_assignments")
      .update({ last_activity: new Date().toISOString() })
      .match({ 
        officer_id: officerId, 
        stream_id: streamId, 
        status: "active" 
      });

    if (updateError) {
      console.error("Error updating activity:", updateError);
      return new Response("Failed to update activity", { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("Error in officer-touch-activity:", e);
    return new Response(JSON.stringify({ error: "Server error" }), { 
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});

