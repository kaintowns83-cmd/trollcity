import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Simple Agora token generation for Deno
async function generateAgoraToken(appId: string, appCertificate: string, channelName: string, uid: number, role: string, expireTime: number) {
  const version = 6;
  const roleValue = role === 'publisher' ? 1 : 2; // 1 for publisher, 2 for subscriber

  // Create the signature content
  const timestamp = Math.floor(Date.now() / 1000);
  const randomInt = Math.floor(Math.random() * 0xFFFFFFFF);

  const content = `${appId}${channelName}${uid}${roleValue}${timestamp}${expireTime}${randomInt}`;

  // Generate HMAC-SHA256 signature using Web Crypto API
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appCertificate),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(content));
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Build the token
  const token = `006${appId}${timestamp.toString(16).padStart(8, '0')}${randomInt.toString(16).padStart(8, '0')}${expireTime.toString(16).padStart(8, '0')}${signatureHex}`;

  return token;
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

    const APP_ID = Deno.env.get('AGORA_APP_ID')!;
    const APP_CERTIFICATE = Deno.env.get('AGORA_APP_CERTIFICATE')!;

    if (!APP_ID || !APP_CERTIFICATE) {
      return new Response(JSON.stringify({ error: 'Agora app ID and certificate not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Token valid for 24 hours
    const expireTime = Math.floor(Date.now() / 1000) + 86400;

    const token = await generateAgoraToken(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      parseInt(uid),
      role,
      expireTime
    );

    return new Response(JSON.stringify({
      token,
      appId: APP_ID,
      channelName,
      uid,
      expiresAt: new Date(expireTime * 1000).toISOString()
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
