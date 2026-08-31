import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SQUARE_API_BASE = 'https://dashboardmroinstagramvini-online.squareweb.app';

// Background task to update user days
async function updateUserDaysInBackground() {
  console.log('[UPDATE-USER-DAYS] Background task started...');
  
  try {
    // Fetch all users from SquareCloud
    const response = await fetch(`${SQUARE_API_BASE}/obter-usuarios`);
    const text = await response.text();
    
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('[UPDATE-USER-DAYS] Failed to parse SquareCloud response');
      return;
    }

    if (!data.success || !Array.isArray(data.usuarios)) {
      console.error('[UPDATE-USER-DAYS] Invalid response format from SquareCloud');
      return;
    }

    const usuarios = data.usuarios;
    console.log(`[UPDATE-USER-DAYS] Found ${usuarios.length} users from SquareCloud`);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build a map of username -> daysRemaining from SquareCloud
    const userDaysMap = new Map<string, number>();
    for (const usuario of usuarios) {
      const username = usuario.ID?.toLowerCase();
      const daysRemaining = usuario.data?.dataDeExpiracao ?? 0;
      if (username) {
        userDaysMap.set(username, daysRemaining);
        console.log(`[UPDATE-USER-DAYS] SquareCloud: ${username} = ${daysRemaining} days`);
      }
    }

    // Get all existing user_sessions from database
    const { data: existingUsers, error: fetchError } = await supabase
      .from('user_sessions')
      .select('id, squarecloud_username, days_remaining');

    if (fetchError) {
      console.error('[UPDATE-USER-DAYS] Error fetching existing users:', fetchError);
      return;
    }

    console.log(`[UPDATE-USER-DAYS] Found ${existingUsers?.length || 0} users in database`);

    // Update each user with their days from SquareCloud
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const dbUser of (existingUsers || [])) {
      const username = dbUser.squarecloud_username?.toLowerCase();
      if (!username) continue;

      // Get days from SquareCloud API
      const squareDays = userDaysMap.get(username);
      
      if (squareDays === undefined) {
        console.log(`[UPDATE-USER-DAYS] User ${username} not found in SquareCloud, skipping`);
        skipped++;
        continue;
      }

      // Only update if days are different
      if (dbUser.days_remaining === squareDays) {
        console.log(`[UPDATE-USER-DAYS] User ${username} already has ${squareDays} days, skipping`);
        skipped++;
        continue;
      }

      try {
        const { error } = await supabase
          .from('user_sessions')
          .update({ 
            days_remaining: squareDays,
            updated_at: new Date().toISOString()
          })
          .eq('id', dbUser.id);

        if (error) {
          console.error(`[UPDATE-USER-DAYS] Error updating ${username}:`, error.message);
          errors++;
        } else {
          console.log(`[UPDATE-USER-DAYS] Updated ${username}: ${dbUser.days_remaining} -> ${squareDays} days`);
          updated++;
        }
      } catch (e) {
        console.error(`[UPDATE-USER-DAYS] Exception updating ${username}:`, e);
        errors++;
      }
    }

    console.log(`[UPDATE-USER-DAYS] Background task complete: Updated ${updated}, Skipped ${skipped}, Errors ${errors}`);
  } catch (error) {
    console.error('[UPDATE-USER-DAYS] Background task error:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[UPDATE-USER-DAYS] Request received, starting background task...');

    // Start the background task without waiting
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(updateUserDaysInBackground());

    // Return immediately
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Atualização iniciada em segundo plano. Os dias serão atualizados em ~2-3 minutos.',
        background: true,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[UPDATE-USER-DAYS] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
