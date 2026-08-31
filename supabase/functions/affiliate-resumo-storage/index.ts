import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[AFFILIATE-RESUMO-STORAGE] ${step}${detailsStr}`);
};

// Function to format date to Brazil timezone (UTC-3)
const formatToBrazilTime = (dateString: string): string => {
  const date = new Date(dateString);
  // Subtract 3 hours to convert UTC to Brazil time (UTC-3)
  const brazilOffset = -3 * 60; // -3 hours in minutes
  const utcOffset = date.getTimezoneOffset(); // Get current timezone offset
  const totalOffset = brazilOffset - utcOffset;
  const brazilDate = new Date(date.getTime() + totalOffset * 60 * 1000);
  
  const day = brazilDate.getDate().toString().padStart(2, '0');
  const month = (brazilDate.getMonth() + 1).toString().padStart(2, '0');
  const year = brazilDate.getFullYear();
  const hours = brazilDate.getHours().toString().padStart(2, '0');
  const minutes = brazilDate.getMinutes().toString().padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, affiliateId, password, resumoData } = await req.json();
    
    logStep("Request received", { action, affiliateId });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === "verify-password") {
      // Verify affiliate password
      try {
        const { data, error } = await supabase.storage
          .from('user-data')
          .download(`affiliate-resumos/${affiliateId}/config.json`);
        
        if (error) {
          logStep("Config not found, using default password", { affiliateId });
          // Default password is the affiliate ID if no config exists
          const isValid = password === affiliateId || password === "mro2024";
          return new Response(
            JSON.stringify({ success: isValid }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const text = await data.text();
        const config = JSON.parse(text);
        const isValid = password === config.password;
        
        logStep("Password verified", { affiliateId, isValid });
        
        return new Response(
          JSON.stringify({ success: isValid }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        // If no config, use default password
        const isValid = password === affiliateId || password === "mro2024";
        return new Response(
          JSON.stringify({ success: isValid }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (action === "get-config") {
      // Get affiliate config (password, etc)
      try {
        const { data, error } = await supabase.storage
          .from('user-data')
          .download(`affiliate-resumos/${affiliateId}/config.json`);
        
        if (error) {
          logStep("Config not found", { affiliateId });
          return new Response(
            JSON.stringify({ success: true, password: affiliateId }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const text = await data.text();
        const config = JSON.parse(text);
        
        logStep("Config loaded", { affiliateId });
        
        return new Response(
          JSON.stringify({ success: true, password: config.password }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ success: true, password: affiliateId }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (action === "set-password") {
      // Set affiliate password
      const config = { password, updatedAt: new Date().toISOString() };
      
      const { error } = await supabase.storage
        .from('user-data')
        .upload(
          `affiliate-resumos/${affiliateId}/config.json`,
          JSON.stringify(config),
          { contentType: 'application/json', upsert: true }
        );
      
      if (error) {
        logStep("Error setting password", { error: error.message });
        throw error;
      }
      
      logStep("Password set successfully", { affiliateId });
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === "save") {
      // Save resumo data
      const dataToSave = {
        ...resumoData,
        updatedAt: new Date().toISOString()
      };
      
      const { error } = await supabase.storage
        .from('user-data')
        .upload(
          `affiliate-resumos/${affiliateId}/resumo.json`,
          JSON.stringify(dataToSave),
          { contentType: 'application/json', upsert: true }
        );
      
      if (error) {
        logStep("Error saving resumo", { error: error.message });
        throw error;
      }
      
      logStep("Resumo saved successfully", { affiliateId });
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === "get") {
      // Get resumo data
      const { data, error } = await supabase.storage
        .from('user-data')
        .download(`affiliate-resumos/${affiliateId}/resumo.json`);
      
      if (error) {
        logStep("Resumo not found", { affiliateId, error: error.message });
        return new Response(
          JSON.stringify({ success: false, error: 'Resumo not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const text = await data.text();
      const resumo = JSON.parse(text);
      
      logStep("Resumo loaded", { affiliateId });
      
      return new Response(
        JSON.stringify({ success: true, resumo }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === "get-realtime") {
      // Get realtime data from mro_orders
      logStep("Fetching realtime data for affiliate", { affiliateId });
      
      // Get affiliate config to get name
      let affiliateName = affiliateId;
      let isLifetime = false;
      try {
        const { data: configData } = await supabase.storage
          .from('user-data')
          .download('admin/affiliates.json');
        
        if (configData) {
          const affiliatesText = await configData.text();
          const affiliates = JSON.parse(affiliatesText);
          const affiliate = affiliates.find((a: any) => a.id.toLowerCase() === affiliateId.toLowerCase());
          if (affiliate) {
            affiliateName = affiliate.name;
            isLifetime = affiliate.isLifetime || false;
          }
        }
      } catch (e) {
        logStep("Could not load affiliate config", { error: e });
      }
      
      // Load paid commissions
      let paidCommissions: Record<string, string[]> = {};
      try {
        const { data: commissionsData } = await supabase.storage
          .from('user-data')
          .download('admin/paid-commissions.json');
        
        if (commissionsData) {
          const commissionsText = await commissionsData.text();
          paidCommissions = JSON.parse(commissionsText);
          logStep("Loaded paid commissions", { paidCommissions });
        }
      } catch (e) {
        logStep("No paid commissions data yet");
      }
      
      // Get orders for this affiliate
      const { data: ordersData, error: ordersError } = await supabase
        .from('mro_orders')
        .select('*')
        .ilike('email', `${affiliateId.toLowerCase()}:%`)
        .order('created_at', { ascending: false });
      
      if (ordersError) {
        logStep("Error fetching orders", { error: ordersError.message });
        throw ordersError;
      }
      
      const orders = ordersData || [];
      logStep("Fetched orders", { count: orders.length });
      
      // Calculate stats
      const salesRaw = orders.filter((o: any) => o.status === 'paid' || o.status === 'completed');
      const attempts = orders.filter((o: any) => o.status === 'pending' || o.status === 'expired');

      // Deduplicar vendas por email OU telefone (manter apenas a venda mais recente)
      const getBaseEmail = (rawEmail: string): string => {
        const lower = (rawEmail || '').trim().toLowerCase();
        const parts = lower.split(':');
        if (parts.length > 1) return parts.slice(1).join(':');
        return lower;
      };

      const normalizePhone = (phone: string | null | undefined): string => {
        if (!phone) return "";
        return phone.replace(/\D/g, "");
      };

      const saleTimestamp = (sale: any): number => {
        const t = sale.completed_at || sale.paid_at || sale.updated_at || sale.created_at;
        const ms = new Date(t).getTime();
        return Number.isFinite(ms) ? ms : 0;
      };

      const saleRank = (status: string): number => {
        if (status === 'completed') return 2;
        if (status === 'paid') return 1;
        return 0;
      };

      const isBetterSale = (newSale: any, current: any): boolean => {
        const rNew = saleRank(newSale.status);
        const rCur = saleRank(current.status);
        if (rNew > rCur) return true;
        if (rNew < rCur) return false;
        return saleTimestamp(newSale) > saleTimestamp(current);
      };

      // Ordenar por rank e timestamp (melhores primeiro)
      const sortedSales = [...salesRaw].sort((a: any, b: any) => {
        const rankDiff = saleRank(b.status) - saleRank(a.status);
        if (rankDiff !== 0) return rankDiff;
        return saleTimestamp(b) - saleTimestamp(a);
      });

      // Deduplicar por email E telefone
      const seenEmails = new Set<string>();
      const seenPhones = new Set<string>();
      const sales: any[] = [];

      for (const sale of sortedSales) {
        const emailKey = getBaseEmail(sale.email);
        const phoneKey = normalizePhone(sale.phone);

        // Se já vimos este email OU este telefone, pular
        if (seenEmails.has(emailKey)) continue;
        if (phoneKey && phoneKey.length >= 8 && seenPhones.has(phoneKey)) continue;

        // Este é o melhor para este email/telefone
        sales.push(sale);
        seenEmails.add(emailKey);
        if (phoneKey && phoneKey.length >= 8) {
          seenPhones.add(phoneKey);
        }
      }

      const paidEmailSet = new Set(sales.map((s: any) => getBaseEmail(s.email)));
      const paidPhoneSet = new Set(sales.map((s: any) => normalizePhone(s.phone)).filter(p => p && p.length >= 8));

      // Get paid commission NSUs for this affiliate
      const affiliatePaidCommissions = paidCommissions[affiliateId] || paidCommissions[affiliateId.toLowerCase()] || [];

      const salesList = sales.map((sale: any) => ({
        customerEmail: sale.email.replace(`${affiliateId}:`, "").replace(`${affiliateId.toLowerCase()}:`, ""),
        customerName: sale.username,
        phone: sale.phone || "",
        amount: sale.amount,
        date: formatToBrazilTime(sale.paid_at || sale.created_at),
        nsuOrder: sale.nsu_order,
        commissionPaid: affiliatePaidCommissions.includes(sale.nsu_order)
      }));

      // Filtrar tentativas: remover se email OU telefone já está em vendas pagas
      const attemptsList = attempts
        .filter((a: any) => {
          const emailKey = getBaseEmail(a.email);
          const phoneKey = normalizePhone(a.phone);
          if (paidEmailSet.has(emailKey)) return false;
          if (phoneKey && phoneKey.length >= 8 && paidPhoneSet.has(phoneKey)) return false;
          return true;
        })
        .map((attempt: any) => ({
          email: attempt.email.replace(`${affiliateId}:`, "").replace(`${affiliateId.toLowerCase()}:`, ""),
          username: attempt.username,
          phone: attempt.phone || "",
          date: formatToBrazilTime(attempt.created_at)
        }));

      // Multiple attempts detection
      const emailCounts: Record<string, number> = {};
      attempts.forEach((a: any) => {
        const baseEmail = getBaseEmail(a.email);
        emailCounts[baseEmail] = (emailCounts[baseEmail] || 0) + 1;
      });

      const multipleAttemptsList = Object.entries(emailCounts)
        .filter(([, count]) => count > 1)
        .map(([email, count]) => {
          const latestAttempt = attempts.find((a: any) => getBaseEmail(a.email) === email);
          return {
            email,
            username: latestAttempt?.username || '',
            phone: latestAttempt?.phone || '',
            date: latestAttempt ? formatToBrazilTime(latestAttempt.created_at) : '',
            totalAttempts: count
          };
        });

      const totalCommission = sales.length * 97;
      const paidCommissionsTotal = salesList.filter(s => s.commissionPaid).length * 97;
      const pendingCommissionsTotal = totalCommission - paidCommissionsTotal;

      const resumo = {
        affiliateId,
        affiliateName,
        totalSales: sales.length,
        totalCommission,
        paidCommissionsTotal,
        pendingCommissionsTotal,
        salesList,
        attemptsList,
        multipleAttemptsList,
        promoStatus: isLifetime ? 'vitalício' : 'em andamento',
        updatedAt: new Date().toISOString()
      };
      
      logStep("Realtime resumo built", { 
        sales: sales.length, 
        attempts: attemptsList.length,
        multipleAttempts: multipleAttemptsList.length,
        paidCommissions: salesList.filter(s => s.commissionPaid).length
      });
      
      return new Response(
        JSON.stringify({ success: true, resumo }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    logStep('Error', { error: error instanceof Error ? error.message : 'Unknown' });
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
