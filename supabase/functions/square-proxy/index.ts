import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SQUARE_API_BASE = 'https://dashboardmroinstagramvini-online.squareweb.app';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { endpoint, method, body, contentType } = await req.json();
    
    console.log(`Calling SquareCloud: ${method} ${endpoint}`);

    const fetchOptions: RequestInit = {
      method: method || 'POST',
      headers: {} as Record<string, string>,
    };

    if (body) {
      if (contentType === 'form') {
        (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
        fetchOptions.body = body;
      } else {
        (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(body);
      }
    }

    console.log('Request body:', body);

    const response = await fetch(`${SQUARE_API_BASE}${endpoint}`, fetchOptions);
    const responseText = await response.text();
    
    console.log('Response status:', response.status);
    console.log('Response text:', responseText.substring(0, 500));

    // Check if response is HTML (error page)
    if (responseText.trim().startsWith('<!') || responseText.trim().startsWith('<html')) {
      console.error('Received HTML instead of JSON - API might be down or endpoint incorrect');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'API temporariamente indisponível',
          senhaCorrespondente: false
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('Failed to parse response as JSON:', responseText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Resposta inválida do servidor',
          senhaCorrespondente: false
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Parsed data:', JSON.stringify(data));
    
    // Extract diasRestantes from userData.dataDeExpiracao if available
    // The API returns userData.dataDeExpiracao, not diasRestantes at root level
    let responseData = { ...data };
    if (data.userData?.dataDeExpiracao !== undefined) {
      responseData.diasRestantes = data.userData.dataDeExpiracao;
      console.log('[SquareProxy] diasRestantes from userData.dataDeExpiracao:', responseData.diasRestantes);
      console.log('[SquareProxy] Status:', responseData.diasRestantes > 365 ? 'Vitalício' : `${responseData.diasRestantes} dias`);
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Square proxy error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, senhaCorrespondente: false }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
