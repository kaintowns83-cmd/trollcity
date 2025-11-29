import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/// <reference types="https://deno.land/x/types/index.d.ts" />
import { AccessToken } from 'npm:livekit-server-sdk'
declare const Deno: { serve: (handler: (req: Request) => Response | Promise<Response>) => void; env: { get: (key: string) => string | undefined } };

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let payload: any = {};
  try { payload = await req.json(); } catch (_) {
    const url = new URL(req.url);
    payload = { room: url.searchParams.get('room') || 'default-room', identity: (url.searchParams.get('identity') || '').trim() };
  }
  const room = payload?.room || 'default-room';
  const identity = (payload?.identity || '').trim();

  const apiKey = Deno.env.get('LIVEKIT_API_KEY')
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')
  const livekitUrl = Deno.env.get('LIVEKIT_URL')

  if (!apiKey || !apiSecret) {
    return jsonResponse({ error: 'Missing LiveKit API credentials in Supabase Secrets' }, 500)
  }

  if (!identity || identity.toLowerCase() === 'undefined' || identity.toLowerCase() === 'null') {
    return jsonResponse({ error: 'Identity is required' }, 400)
  }

  if (!livekitUrl) {
    return jsonResponse({ error: 'Missing LIVEKIT_URL in Supabase Secrets' }, 500)
  }

  try {
    const token = new AccessToken(apiKey, apiSecret, { identity })
    token.addGrant({ roomJoin: true, room })

    return jsonResponse({ token: token.toJwt(), room, identity, livekitUrl })
  } catch (e) {
    console.error('Token generation error:', e)
    return jsonResponse({ error: 'Failed to generate token' }, 500)
  }
})
