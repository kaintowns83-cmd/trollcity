import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })

  try {
    const MUX_TOKEN_ID = Deno.env.get("MUX_TOKEN_ID")!
    const MUX_TOKEN_SECRET = Deno.env.get("MUX_TOKEN_SECRET")!

    const response = await fetch("https://api.mux.com/video/v1/live-streams", {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        playback_policy: ["public"],
        new_asset_settings: { playback_policy: ["public"] },
        low_latency: true,
      }),
    })

    const json = await response.json()
    return new Response(JSON.stringify(json), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: corsHeaders,
    })
  }
})