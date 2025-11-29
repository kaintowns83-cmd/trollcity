import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  let body = {};
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Missing or invalid JSON body" }),
      { status: 400 }
    );
  }

  const { user_id } = body;

  if (!user_id) {
    return new Response(
      JSON.stringify({ success: false, error: "user_id is required" }),
      { status: 400 }
    );
  }

  // Initialize Supabase client
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Example: Insert spin transaction
  const { data, error } = await supabase
    .from("coin_transactions")
    .insert({
      user_id,
      type: "wheel_spin",
      amount: 10,
      description: "Wheel prize",
    })
    .select();

  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500 }
    );
  }

  return new Response(
    JSON.stringify({ success: true, prize: "10 coins", data }),
    { status: 200 }
  );
});
