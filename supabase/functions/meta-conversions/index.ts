import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_PIXEL_ID = '569414052132145';
const META_API_VERSION = 'v18.0';

interface ConversionEvent {
  event_name: string;
  event_time: number;
  event_id?: string;
  action_source: string;
  event_source_url: string;
  user_data: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
    em?: string; // hashed email
    ph?: string; // hashed phone
  };
  custom_data?: {
    content_name?: string;
    content_category?: string;
    value?: number;
    currency?: string;
  };
}

interface RequestBody {
  pixel_id?: string;
  event_name: string;
  event_id?: string;
  event_source_url: string;
  user_agent?: string;
  client_ip?: string;
  fbc?: string;
  fbp?: string;
  email?: string;
  phone?: string;
  content_name?: string;
  content_category?: string;
  value?: number;
  currency?: string;
  test_event_code?: string;
}

// Simple hash function for user data (SHA256)
async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('META_CONVERSIONS_API_TOKEN');
    
    if (!accessToken) {
      console.error('[META-CONVERSIONS] Access token not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Access token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: RequestBody = await req.json();
    console.log('[META-CONVERSIONS] Received event:', body.event_name, body.event_id);

    // Build user_data object
    const userData: ConversionEvent['user_data'] = {
      client_user_agent: body.user_agent || req.headers.get('user-agent') || undefined,
      client_ip_address: body.client_ip || req.headers.get('x-forwarded-for')?.split(',')[0] || undefined,
    };

    // Add Facebook click ID and browser ID if available
    // Ensure fbc is not truncated or modified by the server
    if (body.fbc) userData.fbc = body.fbc;
    if (body.fbp) userData.fbp = body.fbp;

    // Hash and add email if provided
    if (body.email) {
      userData.em = await hashData(body.email);
    }

    // Hash and add phone if provided
    if (body.phone) {
      userData.ph = await hashData(body.phone);
    }

    // Build event payload
    const event: ConversionEvent = {
      event_name: body.event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: body.event_id, // CRITICAL for deduplication
      action_source: 'website',
      event_source_url: body.event_source_url,
      user_data: userData,
    };

    // Add custom data if provided
    // Always include currency if available, especially for Lead events
    if (body.content_name || body.content_category || body.value || body.currency) {
      event.custom_data = {};
      if (body.content_name) event.custom_data.content_name = body.content_name;
      if (body.content_category) event.custom_data.content_category = body.content_category;
      if (body.value) event.custom_data.value = body.value;
      
      // Default to BRL if any custom data is sent but no currency
      event.custom_data.currency = body.currency || 'BRL';
    }

    // Send to Meta Conversions API
    const activePixelId = body.pixel_id || DEFAULT_PIXEL_ID;
    const metaUrl = `https://graph.facebook.com/${META_API_VERSION}/${activePixelId}/events`;
    
    const metaPayload: Record<string, any> = {
      data: [event],
      access_token: accessToken,
    };

    // Add test_event_code if provided (for Facebook Events Manager testing)
    if (body.test_event_code) {
      metaPayload.test_event_code = body.test_event_code;
      console.log('[META-CONVERSIONS] Using test_event_code:', body.test_event_code);
    }

    console.log('[META-CONVERSIONS] Sending to Meta API:', JSON.stringify(metaPayload, null, 2));

    const metaResponse = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metaPayload),
    });

    const metaResult = await metaResponse.json();
    
    if (!metaResponse.ok) {
      console.error('[META-CONVERSIONS] Meta API error:', metaResult);
      return new Response(
        JSON.stringify({ success: false, error: metaResult }),
        { status: metaResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[META-CONVERSIONS] Meta API response:', metaResult);

    return new Response(
      JSON.stringify({ success: true, result: metaResult }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[META-CONVERSIONS] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
