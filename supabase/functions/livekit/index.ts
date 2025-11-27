import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Generate LiveKit token
async function generateLiveKitToken(apiKey: string, apiSecret: string, roomName: string, identity: string) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: apiKey,
    exp: now + 3600, // 1 hour
    nbf: now,
    sub: identity,
    name: identity,
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true
    }
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header));
  const payloadB64 = btoa(JSON.stringify(payload));
  const message = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { channelName, uid, role } = body;

    if (!channelName || !uid) {
      return new Response(JSON.stringify({ error: 'Missing channelName or uid' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const API_KEY = Deno.env.get('LIVEKIT_API_KEY')!;
    const API_SECRET = Deno.env.get('LIVEKIT_API_SECRET')!;

    if (!API_KEY || !API_SECRET) {
      return new Response(JSON.stringify({ error: 'LiveKit API key and secret not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await generateLiveKitToken(
      API_KEY,
      API_SECRET,
      channelName,
      uid
    );

    return new Response(JSON.stringify({
      token,
      channelName,
      uid
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Agora token generation error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})
