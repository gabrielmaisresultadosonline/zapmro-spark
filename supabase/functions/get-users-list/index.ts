import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all profile registrations
    const { data: profiles, error: profilesError } = await supabase
      .from('squarecloud_user_profiles')
      .select('squarecloud_username, instagram_username, profile_screenshot_url, created_at')
      .order('created_at', { ascending: true });

    if (profilesError) {
      console.error('[get-users-list] Profiles error:', profilesError.message);
      return new Response(
        JSON.stringify({ success: false, error: profilesError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Fetch user sessions for emails
    const { data: sessions, error: sessionsError } = await supabase
      .from('user_sessions')
      .select('squarecloud_username, email');

    if (sessionsError) {
      console.error('[get-users-list] Sessions error:', sessionsError.message);
    }

    const emailMap = new Map<string, string | null>();
    for (const s of (sessions || [])) {
      emailMap.set(s.squarecloud_username, s.email);
    }

    // Group profiles by user
    const userMap = new Map<string, any>();

    for (const p of (profiles || [])) {
      const existing = userMap.get(p.squarecloud_username);
      const igEntry = {
        username: p.instagram_username,
        screenshot_url: p.profile_screenshot_url,
        registered_at: p.created_at,
      };

      if (existing) {
        existing.instagrams.push(igEntry);
        if (new Date(p.created_at) < new Date(existing.first_registered)) {
          existing.first_registered = p.created_at;
        }
      } else {
        userMap.set(p.squarecloud_username, {
          squarecloud_username: p.squarecloud_username,
          email: emailMap.get(p.squarecloud_username) || null,
          first_registered: p.created_at,
          instagrams: [igEntry],
        });
      }
    }

    const merged = Array.from(userMap.values());
    merged.sort((a: any, b: any) => new Date(b.first_registered).getTime() - new Date(a.first_registered).getTime());

    console.log(`[get-users-list] Found ${merged.length} users with ${profiles?.length || 0} profiles`);

    return new Response(
      JSON.stringify({ success: true, users: merged }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[get-users-list] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
