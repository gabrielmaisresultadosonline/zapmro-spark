import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const log = (step: string, details?: unknown) => {
  console.log(`[ADS-AUTH] ${step}:`, details ? JSON.stringify(details, null, 2) : '');
};

const sendEmailViaSMTP = async (to: string, subject: string, html: string) => {
  const smtpPassword = Deno.env.get("SMTP_PASSWORD");
  if (!smtpPassword) {
    log("SMTP password not configured, skipping email");
    return false;
  }

  try {
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.hostinger.com",
        port: 465,
        tls: true,
        auth: {
          username: "suporte@maisresultadosonline.com.br",
          password: smtpPassword,
        },
      },
    });

    await client.send({
      from: "Ads News <suporte@maisresultadosonline.com.br>",
      to: to,
      subject: subject,
      content: "auto",
      html: html,
    });

    await client.close();
    log('Email sent successfully', { to, subject });
    return true;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log('Email send error', { error: errMsg });
    return false;
  }
};

// Check password with bcrypt support and auto-upgrade
const checkPassword = async (
  supabase: any,
  tableName: string,
  userId: string,
  inputPassword: string,
  storedPassword: string
): Promise<boolean> => {
  if (storedPassword.startsWith("$2")) {
    // Password is already hashed with bcrypt
    return await bcrypt.compare(inputPassword, storedPassword);
  } else {
    // Legacy plaintext password - check and upgrade
    const isValid = storedPassword === inputPassword;
    
    if (isValid) {
      // Upgrade to bcrypt hash
      log("Upgrading password to bcrypt", { tableName, userId });
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(inputPassword, salt);
      
      await supabase
        .from(tableName)
        .update({ password: hashedPassword })
        .eq("id", userId);
    }
    
    return isValid;
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const smtpPassword = Deno.env.get('SMTP_PASSWORD');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action, email, password } = body;
    log('Request received', { action, email });

    if (action === 'login') {
      // Login user - fetch by email only
      const cleanEmail = email?.toLowerCase()?.trim();
      const allowPending = body.allowPending === true;
      
      const { data: user, error } = await supabase
        .from('ads_users')
        .select('*')
        .ilike('email', cleanEmail)
        .single();

      if (error || !user) {
        log('Login failed - user not found', { error });
        return new Response(
          JSON.stringify({ success: false, error: 'Email ou senha inválidos' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check password with bcrypt support
      const passwordValid = await checkPassword(supabase, 'ads_users', user.id, password, user.password);

      if (!passwordValid) {
        log('Login failed - invalid password');
        return new Response(
          JSON.stringify({ success: false, error: 'Email ou senha inválidos' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Block only if not active AND not allowing pending users
      if (user.status !== 'active' && !allowPending) {
        log('User not active', user);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Sua conta ainda não está ativa. Aguarde a confirmação do pagamento.',
            isPending: user.status === 'pending',
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              status: user.status
            }
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get client data if exists
      const { data: clientData } = await supabase
        .from('ads_client_data')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // Get balance orders
      const { data: balanceOrders } = await supabase
        .from('ads_balance_orders')
        .select('id, user_id, amount, leads_quantity, status, paid_at, created_at, infinitepay_link, nsu_order')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      log('Login successful', { userId: user.id, status: user.status });
      return new Response(
        JSON.stringify({ 
          success: true, 
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            status: user.status,
            subscription_start: user.subscription_start,
            subscription_end: user.subscription_end
          },
          clientData,
          balanceOrders: balanceOrders || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'admin-login') {
      // Admin login - fetch by email only
      const { data: admin, error } = await supabase
        .from('ads_admins')
        .select('*')
        .eq('email', email)
        .single();

      if (error || !admin) {
        log('Admin login failed - not found', { error });
        return new Response(
          JSON.stringify({ success: false, error: 'Credenciais inválidas' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check password with bcrypt support
      const passwordValid = await checkPassword(supabase, 'ads_admins', admin.id, password, admin.password);

      if (!passwordValid) {
        log('Admin login failed - invalid password');
        return new Response(
          JSON.stringify({ success: false, error: 'Credenciais inválidas' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      log('Admin login successful', { adminId: admin.id });
      return new Response(
        JSON.stringify({ 
          success: true, 
          admin: {
            id: admin.id,
            name: admin.name,
            email: admin.email
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'check-payment') {
      // Check if user's payment is confirmed
      const { data: user } = await supabase
        .from('ads_users')
        .select('status')
        .eq('email', email)
        .single();

      return new Response(
        JSON.stringify({ 
          success: true, 
          isPaid: user?.status === 'active'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'save-client-data') {
      // Save client campaign data
      const { userId, niche, region, instagram, whatsapp, telegramGroup, logoUrl, observations, competitor1Instagram, competitor2Instagram, mediaUrls, offerDescription } = body;

      const { data: existing } = await supabase
        .from('ads_client_data')
        .select('id, edit_count')
        .eq('user_id', userId)
        .single();

      if (existing) {
        // Update existing and increment edit_count
        const newEditCount = (existing.edit_count || 0) + 1;
        const { error } = await supabase
          .from('ads_client_data')
          .update({
            niche,
            region,
            instagram,
            whatsapp,
            telegram_group: telegramGroup,
            logo_url: logoUrl,
            observations,
            competitor1_instagram: competitor1Instagram,
            competitor2_instagram: competitor2Instagram,
            media_urls: mediaUrls || [],
            offer_description: offerDescription,
            edit_count: newEditCount
          })
          .eq('user_id', userId);

        if (error) throw error;
      } else {
        // Insert new with edit_count = 1
        const { error } = await supabase
          .from('ads_client_data')
          .insert({
            user_id: userId,
            niche,
            region,
            instagram,
            whatsapp,
            telegram_group: telegramGroup,
            logo_url: logoUrl,
            observations,
            competitor1_instagram: competitor1Instagram,
            competitor2_instagram: competitor2Instagram,
            media_urls: mediaUrls || [],
            offer_description: offerDescription,
            edit_count: 1
          });

        if (error) throw error;
      }

      log('Client data saved', { userId });
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'get-all-users') {
      // Admin: Get all users with their data
      const { data: users, error } = await supabase
        .from('ads_users')
        .select(`
          *,
          ads_client_data (*),
          ads_orders (*),
          ads_balance_orders (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Remove passwords from response
      const sanitizedUsers = users?.map(user => {
        const { password, ...rest } = user;
        return rest;
      });

      return new Response(
        JSON.stringify({ success: true, users: sanitizedUsers }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'get-all-orders') {
      // Admin: Get all orders with user data
      const { data: orders, error } = await supabase
        .from('ads_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // For paid orders, get user client data and balance orders
      const ordersWithData = await Promise.all(orders.map(async (order) => {
        if (order.status === 'paid') {
          const { data: user } = await supabase
            .from('ads_users')
            .select('id, status, subscription_end')
            .ilike('email', order.email)
            .single();

          if (user) {
            const { data: clientData } = await supabase
              .from('ads_client_data')
              .select('*')
              .eq('user_id', user.id)
              .single();

            const { data: balanceOrders } = await supabase
              .from('ads_balance_orders')
              .select('*')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false });

            return { 
              ...order, 
              user: { ...user, ads_balance_orders: balanceOrders || [] }, 
              clientData 
            };
          }
        }
        return order;
      }));

      return new Response(
        JSON.stringify({ success: true, orders: ordersWithData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'update-user-status') {
      // Admin: Update user status
      const { userId, status } = body;

      const { error } = await supabase
        .from('ads_users')
        .update({ status })
        .eq('id', userId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'update-order-status') {
      // Admin: Update order status
      const { orderId, status } = body;

      const updateData: Record<string, unknown> = { status };
      if (status === 'paid') {
        updateData.paid_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('ads_orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;

      // If marked as paid, also activate the user
      if (status === 'paid') {
        const { data: order } = await supabase
          .from('ads_orders')
          .select('email')
          .eq('id', orderId)
          .single();

        if (order) {
          const subscriptionStart = new Date();
          const subscriptionEnd = new Date();
          subscriptionEnd.setDate(subscriptionEnd.getDate() + 30);

          await supabase
            .from('ads_users')
            .update({
              status: 'active',
              subscription_start: subscriptionStart.toISOString(),
              subscription_end: subscriptionEnd.toISOString()
            })
            .ilike('email', order.email);
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'save-sales-page') {
      // Admin: Save sales page URL for user
      const { userId, salesPageUrl } = body;

      const { error } = await supabase
        .from('ads_client_data')
        .update({ sales_page_url: salesPageUrl })
        .eq('user_id', userId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'enable-renewal') {
      // Admin: Enable renewal payment for user
      const { userId } = body;

      const { error } = await supabase
        .from('ads_users')
        .update({ status: 'renewal_pending' })
        .eq('id', userId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'expire-user') {
      // Admin: Expire user subscription
      const { userId } = body;

      const { error } = await supabase
        .from('ads_users')
        .update({ status: 'expired' })
        .eq('id', userId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'activate-ads') {
      // Admin: Activate ads for user with end date and page URL
      const { userId, subscriptionEnd, salesPageUrl, sendEmail, balanceAmount } = body;

      // Calculate campaign end date (30 days from activation)
      const campaignActivatedAt = new Date();
      const campaignEndDate = new Date(campaignActivatedAt);
      campaignEndDate.setDate(campaignEndDate.getDate() + 30);

      // Update user status and subscription end
      const { error: userError } = await supabase
        .from('ads_users')
        .update({
          status: 'active',
          subscription_end: new Date(subscriptionEnd).toISOString()
        })
        .eq('id', userId);

      if (userError) throw userError;

      // Update client data with campaign activation and sales page
      const { data: existing } = await supabase
        .from('ads_client_data')
        .select('id')
        .eq('user_id', userId)
        .single();

      const campaignData = {
        sales_page_url: salesPageUrl || null,
        campaign_active: true,
        campaign_activated_at: campaignActivatedAt.toISOString(),
        campaign_end_date: campaignEndDate.toISOString()
      };

      if (existing) {
        await supabase
          .from('ads_client_data')
          .update(campaignData)
          .eq('user_id', userId);
      } else {
        await supabase
          .from('ads_client_data')
          .insert({
            user_id: userId,
            ...campaignData
          });
      }

      // Send activation email if requested
      if (sendEmail && smtpPassword) {
        const { data: user } = await supabase
          .from('ads_users')
          .select('name, email')
          .eq('id', userId)
          .single();

        if (user) {
          const endDate = campaignEndDate.toLocaleDateString('pt-BR');
          const year = new Date().getFullYear();

          const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; padding: 20px 0;">
<tr>
<td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">

<tr>
<td style="background: linear-gradient(135deg, #1d4ed8, #3b82f6); padding: 30px; text-align: center;">
<img src="https://adljdeekwifwcdcgbpit.supabase.co/storage/v1/object/public/assets/ads-news-full.png" alt="Ads News" style="max-width: 180px; height: auto;" />
</td>
</tr>

<tr>
<td style="padding: 40px 30px;">
<h1 style="color: #1d4ed8; margin: 0 0 20px 0; font-size: 28px;">Olá, ${user.name}! 🎉</h1>
<p style="color: #333; font-size: 16px; line-height: 1.6;">
Sua campanha de anúncios foi ativada com sucesso!
</p>
<p style="color: #333; font-size: 16px; line-height: 1.6;">
Sua campanha estará ativa até <strong>${endDate}</strong>.
</p>
${salesPageUrl ? `<p style="color: #333; font-size: 16px; line-height: 1.6;">
Sua página de vendas: <a href="${salesPageUrl}" style="color: #1d4ed8;">${salesPageUrl}</a>
</p>` : ''}
${balanceAmount ? `<p style="color: #333; font-size: 16px; line-height: 1.6;">
Saldo de leads: <strong>${balanceAmount}</strong>
</p>` : ''}
</td>
</tr>

<tr>
<td style="background-color: #f8fafc; padding: 20px 30px; text-align: center;">
<p style="color: #666; font-size: 12px; margin: 0;">
© ${year} Ads News. Todos os direitos reservados.
</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;

          await sendEmailViaSMTP(user.email, '🎉 Sua campanha foi ativada!', html);
        }
      }

      log('Ads activated', { userId });
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'request-balance') {
      // User: Request balance top-up
      const { userId, amount, leadsQuantity } = body;

      // Generate unique NSU
      const nsuOrder = `BAL${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // Create InfiniPay payment link
      const infinitePayApiKey = Deno.env.get('INFINITEPAY_API_KEY');
      let infinitepayLink = null;

      if (infinitePayApiKey) {
        try {
          const response = await fetch('https://api.infinitepay.io/v2/checkout', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${infinitePayApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              amount: amount * 100, // Convert to cents
              order_id: nsuOrder,
              metadata: {
                type: 'balance',
                user_id: userId,
                leads_quantity: leadsQuantity
              }
            })
          });

          if (response.ok) {
            const data = await response.json();
            infinitepayLink = data.payment_url;
          }
        } catch (e) {
          log('InfiniPay error', e);
        }
      }

      // Create balance order
      const { data: order, error } = await supabase
        .from('ads_balance_orders')
        .insert({
          user_id: userId,
          amount,
          leads_quantity: leadsQuantity,
          nsu_order: nsuOrder,
          infinitepay_link: infinitepayLink,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      log('Balance requested', { userId, amount, leadsQuantity });
      return new Response(
        JSON.stringify({ success: true, order }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'get-balance-orders') {
      // Get balance orders for user
      const { userId } = body;

      const { data: orders, error } = await supabase
        .from('ads_balance_orders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, orders }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'confirm-balance') {
      // Admin: Confirm balance payment
      const { orderId } = body;

      const { error } = await supabase
        .from('ads_balance_orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;

      log('Balance confirmed', { orderId });
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Ação não reconhecida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log('Error', { error: errMsg });
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
