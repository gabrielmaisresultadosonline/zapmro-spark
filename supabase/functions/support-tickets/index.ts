import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateTicketNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TK-${timestamp}-${random}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, ...data } = await req.json();
    console.log(`[Tickets] Action: ${action}`);

    switch (action) {
      case 'create': {
        const { platform, username, email, subject, message, priority } = data;
        
        if (!platform || !username || !subject || !message) {
          return new Response(
            JSON.stringify({ success: false, error: 'Campos obrigatórios não preenchidos' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        const ticketNumber = generateTicketNumber();

        const { data: ticket, error } = await supabase
          .from('support_tickets')
          .insert({
            ticket_number: ticketNumber,
            platform,
            username,
            email: email || null,
            subject,
            message,
            priority: priority || 'normal',
            status: 'open'
          })
          .select()
          .single();

        if (error) {
          console.error('[Tickets] Create error:', error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        console.log(`[Tickets] Created ticket ${ticketNumber} for ${platform}`);
        return new Response(
          JSON.stringify({ success: true, ticket }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list': {
        const { platform, status } = data;
        
        let query = supabase.from('support_tickets').select('*');
        
        if (platform) {
          query = query.eq('platform', platform);
        }
        if (status) {
          query = query.eq('status', status);
        }
        
        query = query.order('created_at', { ascending: false });

        const { data: tickets, error } = await query;

        if (error) {
          console.error('[Tickets] List error:', error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        return new Response(
          JSON.stringify({ success: true, tickets }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update': {
        const { id, status, admin_notes, priority } = data;
        
        if (!id) {
          return new Response(
            JSON.stringify({ success: false, error: 'ID do ticket não fornecido' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        const updateData: any = { updated_at: new Date().toISOString() };
        if (status) {
          updateData.status = status;
          if (status === 'resolved' || status === 'closed') {
            updateData.resolved_at = new Date().toISOString();
          }
        }
        if (admin_notes !== undefined) updateData.admin_notes = admin_notes;
        if (priority) updateData.priority = priority;

        const { data: ticket, error } = await supabase
          .from('support_tickets')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          console.error('[Tickets] Update error:', error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        console.log(`[Tickets] Updated ticket ${id}`);
        return new Response(
          JSON.stringify({ success: true, ticket }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        const { id } = data;
        
        if (!id) {
          return new Response(
            JSON.stringify({ success: false, error: 'ID do ticket não fornecido' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        const { error } = await supabase
          .from('support_tickets')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('[Tickets] Delete error:', error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        console.log(`[Tickets] Deleted ticket ${id}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'stats': {
        const { data: allTickets, error } = await supabase
          .from('support_tickets')
          .select('platform, status');

        if (error) {
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        const stats = {
          instagram: { open: 0, in_progress: 0, resolved: 0, closed: 0, total: 0 },
          zapmro: { open: 0, in_progress: 0, resolved: 0, closed: 0, total: 0 }
        };

        allTickets?.forEach((t: any) => {
          if (stats[t.platform as keyof typeof stats]) {
            stats[t.platform as keyof typeof stats][t.status as keyof typeof stats.instagram]++;
            stats[t.platform as keyof typeof stats].total++;
          }
        });

        return new Response(
          JSON.stringify({ success: true, stats }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Ação inválida' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
  } catch (error) {
    console.error('[Tickets] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
