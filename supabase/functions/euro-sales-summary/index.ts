import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  const timestamp = new Date().toISOString();
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[${timestamp}] [EURO-SALES-SUMMARY] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log("Generating Euro sales summary");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { affiliateEmail, affiliateName, sendEmail } = body;

    if (!affiliateEmail) {
      return new Response(
        JSON.stringify({ error: "affiliateEmail é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get all completed/paid Euro orders
    const { data: orders, error } = await supabase
      .from("mro_euro_orders")
      .select("*")
      .in("status", ["completed", "paid"])
      .order("paid_at", { ascending: false });

    if (error) {
      log("Error fetching orders", error);
      throw error;
    }

    const now = new Date();
    const formattedDate = now.toLocaleDateString("pt-BR", { 
      day: "2-digit", 
      month: "2-digit", 
      year: "numeric" 
    });
    const formattedTime = now.toLocaleTimeString("pt-BR", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });

    const totalSales = orders?.length || 0;
    const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.amount), 0) || 0;

    // Build sales list HTML
    const salesListHtml = orders?.map((order, index) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #333;">${index + 1}</td>
        <td style="padding:10px;border-bottom:1px solid #333;">${order.username}</td>
        <td style="padding:10px;border-bottom:1px solid #333;">${order.email}</td>
        <td style="padding:10px;border-bottom:1px solid #333;">€${Number(order.amount).toFixed(2)}</td>
        <td style="padding:10px;border-bottom:1px solid #333;">${order.paid_at ? new Date(order.paid_at).toLocaleDateString("pt-BR") : "-"}</td>
        <td style="padding:10px;border-bottom:1px solid #333;">${order.status === "completed" ? "✅ Completo" : "💰 Pago"}</td>
      </tr>
    `).join("") || "";

    const summary = {
      date: formattedDate,
      time: formattedTime,
      totalSales,
      totalRevenue,
      orders: orders || [],
    };

    log("Summary generated", { totalSales, totalRevenue });

    // Send email if requested
    if (sendEmail && smtpPassword) {
      try {
        const client = new SMTPClient({
          connection: {
            hostname: "smtp.hostinger.com",
            port: 465,
            tls: true,
            auth: {
              username: "contato@maisresultadosonline.com.br",
              password: smtpPassword,
            },
          },
        });

        const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;line-height:1.6;color:#fff;background-color:#1a1a1a;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;margin:0 auto;background:#1a1a1a;">
<tr>
<td style="padding:30px;">

<!-- Header -->
<div style="text-align:center;margin-bottom:30px;">
<h1 style="color:#FFD700;margin:0;font-size:28px;">📊 RESUMO DE VENDAS EURO</h1>
<p style="color:#9ca3af;margin:10px 0;">MRO Instagram - Vendas Internacionais</p>
</div>

<!-- Summary Box -->
<div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);border-radius:20px;padding:30px;text-align:center;margin-bottom:30px;">
<p style="margin:0;color:#fff;font-size:16px;">Olá, <strong>${affiliateName || "Afiliado"}</strong>!</p>
<p style="margin:15px 0 0 0;color:#fff;font-size:14px;">
Até a data de <strong>${formattedDate}</strong> às <strong>${formattedTime}</strong>
</p>
</div>

<!-- Stats -->
<div style="display:flex;gap:20px;margin-bottom:30px;">
<div style="flex:1;background:#2d2d2d;border:2px solid #10b981;border-radius:15px;padding:20px;text-align:center;">
<p style="margin:0;color:#10b981;font-size:14px;">Total de Vendas</p>
<p style="margin:10px 0 0 0;color:#10b981;font-size:36px;font-weight:bold;">${totalSales}</p>
</div>
<div style="flex:1;background:#2d2d2d;border:2px solid #FFD700;border-radius:15px;padding:20px;text-align:center;">
<p style="margin:0;color:#FFD700;font-size:14px;">Receita Total</p>
<p style="margin:10px 0 0 0;color:#FFD700;font-size:36px;font-weight:bold;">€${totalRevenue.toFixed(2)}</p>
</div>
</div>

<!-- Sales Table -->
<div style="background:#2d2d2d;border-radius:15px;padding:20px;margin-bottom:30px;">
<h3 style="color:#fff;margin:0 0 15px 0;">📋 Lista de Vendas</h3>
<table width="100%" cellpadding="0" cellspacing="0" style="color:#fff;font-size:12px;">
<thead>
<tr style="background:#333;">
<th style="padding:10px;text-align:left;">#</th>
<th style="padding:10px;text-align:left;">Usuário</th>
<th style="padding:10px;text-align:left;">Email</th>
<th style="padding:10px;text-align:left;">Valor</th>
<th style="padding:10px;text-align:left;">Data</th>
<th style="padding:10px;text-align:left;">Status</th>
</tr>
</thead>
<tbody>
${salesListHtml || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#9ca3af;">Nenhuma venda encontrada</td></tr>'}
</tbody>
</table>
</div>

<!-- Footer -->
<div style="text-align:center;padding:20px;border-top:1px solid #333;">
<p style="margin:0;color:#9ca3af;font-size:12px;">
Este é um resumo automático gerado pelo sistema MRO.
</p>
<p style="margin:10px 0 0 0;color:#9ca3af;font-size:12px;">
© ${new Date().getFullYear()} MRO - Mais Resultados Online
</p>
</div>

</td>
</tr>
</table>
</body>
</html>`;

        await client.send({
          from: "MRO Sistema <contato@maisresultadosonline.com.br>",
          to: affiliateEmail,
          subject: `📊 Resumo de Vendas Euro - ${formattedDate} ${formattedTime}`,
          content: "Resumo de vendas Euro - MRO",
          html: htmlContent,
        });

        await client.close();
        log("Summary email sent successfully", { to: affiliateEmail });

        return new Response(
          JSON.stringify({
            success: true,
            message: "Resumo enviado por email com sucesso!",
            summary,
            emailSent: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      } catch (emailError) {
        log("Error sending email", { error: String(emailError) });
        
        return new Response(
          JSON.stringify({
            success: true,
            message: "Resumo gerado, mas erro ao enviar email",
            summary,
            emailSent: false,
            emailError: String(emailError),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        emailSent: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: errorMessage });

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
