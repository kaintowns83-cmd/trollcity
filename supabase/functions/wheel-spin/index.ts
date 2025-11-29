import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/// <reference types="https://deno.land/x/types/index.d.ts" />
import { createClient } from "@supabase/supabase-js";
declare const Deno: { serve: (handler: (req: Request) => Response | Promise<Response>) => void; env: { get: (key: string) => string | undefined } };

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    // no-op: empty or invalid JSON
  }

  const userId = body?.userId ?? body?.user_id ?? null;
  const spinCost = Number(body?.spinCost ?? body?.spin_cost ?? 500);
  const prizes = Array.isArray(body?.prizes) ? body.prizes : [];

  if (!userId) {
    return new Response(JSON.stringify({ success: false, error: 'Missing userId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (!Array.isArray(prizes) || prizes.length === 0) {
    return new Response(JSON.stringify({ success: false, error: 'Missing or invalid prizes' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Random prize selection (weighted)
  const totalWeight = prizes.reduce((a: number, p: { probability: number }) => a + Number(p.probability || 0), 0);
  if (totalWeight <= 0) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid prize probabilities' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  let random = Math.random() * totalWeight;
  const prize = prizes.find((p: { probability: number }) => (random -= Number(p.probability || 0)) <= 0);
  if (!prize) {
    return new Response(JSON.stringify({ success: false, error: 'Prize selection failed' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Deduct cost and apply reward
  const { data, error } = await supabase.rpc('spin_wheel', {
    user_id: userId,
    cost: spinCost,
    prize_amount: (prize as any).value,
    prize_type: (prize as any).type
  });

  if (error) return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({
    success: true,
    prize,
    profile: data
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
