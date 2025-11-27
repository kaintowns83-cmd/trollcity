import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 🧠 Helper: Creates a JWT using native crypto
async function createJWT(payload: Record<string, any>, secret: string) {
  const encoder = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };

  const base64url = (str: string) =>
    btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

  const headerEncoded = base64url(JSON.stringify(header));
  const payloadEncoded = base64url(JSON.stringify(payload));

  const data = `${headerEncoded}.${payloadEncoded}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data)
  );

  const signatureEncoded = base64url(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${data}.${signatureEncoded}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { roomName, identity } = await req.json();

    const apiKey = Deno.env.get("LIVEKIT_API_KEY")!;
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET")!;
    const livekitUrl = Deno.env.get("LIVEKIT_URL")!;

    // 🔐 Create LiveKit-compatible JWT manually
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      exp: now + 60 * 60, // valid for 1 hour
      iss: apiKey,
      sub: identity,
      video: {
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      },
    };

    const token = await createJWT(payload, apiSecret);

    return new Response(
      JSON.stringify({ token, url: livekitUrl }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
