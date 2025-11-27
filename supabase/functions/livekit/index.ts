import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { AccessToken } from "https://deno.land/x/livekit_server_sdk@1.0.3/mod.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req: Request) => {
  // This MUST be the first thing we handle — return 204, no body.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const { roomName, identity } = await req.json()

    const at = new AccessToken(
      Deno.env.get("LIVEKIT_API_KEY"),
      Deno.env.get("LIVEKIT_API_SECRET")
    )
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true })
    at.identity = identity

    const token = await at.toJwt()

    return new Response(
      JSON.stringify({
        token,
        url: Deno.env.get("LIVEKIT_URL"),
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: corsHeaders,
    })
  }
})
