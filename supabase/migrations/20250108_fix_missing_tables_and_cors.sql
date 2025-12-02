-- Fix missing tables and functions
-- This migration addresses console errors

-- 1. Create streams_participants table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.streams_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id UUID NOT NULL REFERENCES public.streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'guest' CHECK (role IN ('host', 'opponent', 'guest')),
  livekit_identity TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stream_id, user_id, is_active) WHERE is_active = true
);

-- 2. Create award_birthday_coins_if_eligible function if it doesn't exist
CREATE OR REPLACE FUNCTION public.award_birthday_coins_if_eligible(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_birthday DATE;
  v_today DATE;
  v_coins_awarded INTEGER := 1000;
  v_result JSONB;
BEGIN
  -- Get user profile
  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Check if user has date_of_birth
  IF v_profile.date_of_birth IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No birthday set');
  END IF;

  v_birthday := v_profile.date_of_birth;
  v_today := CURRENT_DATE;

  -- Check if today is user's birthday (month and day match)
  IF EXTRACT(MONTH FROM v_birthday) = EXTRACT(MONTH FROM v_today) 
     AND EXTRACT(DAY FROM v_birthday) = EXTRACT(DAY FROM v_today) THEN
    
    -- Check if already awarded today (check last_birthday_coins_awarded)
    IF v_profile.last_birthday_coins_awarded IS NOT NULL 
       AND v_profile.last_birthday_coins_awarded::DATE = v_today THEN
      RETURN jsonb_build_object('success', false, 'error', 'Already awarded today');
    END IF;

    -- Award coins
    UPDATE public.user_profiles
    SET 
      paid_coin_balance = COALESCE(paid_coin_balance, 0) + v_coins_awarded,
      last_birthday_coins_awarded = v_today,
      updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'coins_awarded', v_coins_awarded,
      'message', 'Birthday coins awarded!'
    );
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Not your birthday today');
  END IF;
END;
$$;

-- 3. Add last_birthday_coins_awarded column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'last_birthday_coins_awarded'
  ) THEN
    ALTER TABLE public.user_profiles ADD COLUMN last_birthday_coins_awarded TIMESTAMPTZ;
  END IF;
END $$;

-- 4. Add RLS policies for streams_participants
ALTER TABLE public.streams_participants ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read participants in streams they're in
CREATE POLICY "Users can view participants in their streams"
  ON public.streams_participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.streams
      WHERE streams.id = streams_participants.stream_id
      AND (streams.broadcaster_id = auth.uid() OR streams_participants.user_id = auth.uid())
    )
  );

-- Policy: Users can insert themselves as participants
CREATE POLICY "Users can join as participants"
  ON public.streams_participants
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own participant status
CREATE POLICY "Users can update their participant status"
  ON public.streams_participants
  FOR UPDATE
  USING (auth.uid() = user_id);

-- 5. Create index for performance
CREATE INDEX IF NOT EXISTS idx_streams_participants_stream_id ON public.streams_participants(stream_id);
CREATE INDEX IF NOT EXISTS idx_streams_participants_user_id ON public.streams_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_streams_participants_active ON public.streams_participants(stream_id, is_active) WHERE is_active = true;

