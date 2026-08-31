import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INFINITEPAY_HANDLE = 'paguemro';
const INFINITEPAY_CHECKOUT_LINKS_URL = 'https://api.infinitepay.io/invoices/public/checkout/links';
const REDIRECT_URL = 'https://pay.maisresultadosonline.com.br/anuncios/obrigado-saldo';

const log = (step: string, details?: unknown) => {
  console.log(`[ADS-BALANCE-CHECKOUT] ${step}:`, details ? JSON.stringify(details, null, 2) : '');
};

const generateNSU = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `ADSBAL${timestamp}${randomPart}`.toUpperCase();
};

const getCheckoutUrl = (data: any): string | null => {
  return data?.checkout_url || data?.checkoutUrl || data?.link || data?.url || null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, email, amount, leadsQuantity } = await req.json();
    log('Request received', { userId, email, amount, leadsQuantity });

    if (!userId || !email || !amount || !leadsQuantity) {
      return new Response(
        JSON.stringify({ success: false, error: 'Dados incompletos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Maximum balance limit validation: R$700
    const MAX_BALANCE_LIMIT = 700;
    if (amount > MAX_BALANCE_LIMIT) {
      log('Amount exceeds maximum limit', { amount, maxLimit: MAX_BALANCE_LIMIT });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `O valor máximo permitido é R$${MAX_BALANCE_LIMIT}. Para investir mais, entre em contato com o administrador.` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const nsuOrder = generateNSU();
    const priceInCents = Math.round(amount * 100);
    
    // Product name format: saldoanun_EMAIL (different from initial payment anun_EMAIL)
    const description = `saldoanun_${cleanEmail}`;
    const lineItems = [{ description, quantity: 1, price: priceInCents }];
    
    const webhookUrl = `${supabaseUrl}/functions/v1/ads-webhook`;
    
    log('Creating InfiniPay balance checkout with Link Integrado', { nsuOrder, description, priceInCents });

    // Use the correct Link Integrado endpoint (same as ads-checkout)
    const infinitepayPayload = {
      handle: INFINITEPAY_HANDLE,
      items: lineItems,
      itens: lineItems,
      order_nsu: nsuOrder,
      redirect_url: REDIRECT_URL,
      webhook_url: webhookUrl,
      customer: {
        email: cleanEmail,
      },
    };

    const infinitepayResponse = await fetch(INFINITEPAY_CHECKOUT_LINKS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(infinitepayPayload)
    });

    const infinitepayData = await infinitepayResponse.json().catch(() => ({}));
    log('InfiniPay response', {
      status: infinitepayResponse.status,
      ok: infinitepayResponse.ok,
      data: infinitepayData,
    });

    if (!infinitepayResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Erro ao criar link de pagamento',
          details: infinitepayData,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paymentLink = getCheckoutUrl(infinitepayData);
    if (!paymentLink) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Resposta da InfinitePay sem checkout_url',
          details: infinitepayData,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create balance order with 5 minute expiration
    const expiredAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    
    const { data: balanceOrder, error: balanceError } = await supabase
      .from('ads_balance_orders')
      .insert({
        user_id: userId,
        amount,
        leads_quantity: leadsQuantity,
        nsu_order: nsuOrder,
        infinitepay_link: paymentLink,
        status: 'pending'
      })
      .select()
      .single();

    if (balanceError) {
      log('Error creating balance order', balanceError);
      throw balanceError;
    }

    log('Balance order created', balanceOrder);

    return new Response(
      JSON.stringify({
        success: true,
        paymentLink,
        nsuOrder,
        orderId: balanceOrder.id,
        expiresAt: expiredAt
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    log('Error', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
