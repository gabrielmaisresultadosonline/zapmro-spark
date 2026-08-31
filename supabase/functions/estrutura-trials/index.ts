import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SQUARE_API_URL = "https://dashboardmroinstagramvini-online.squareweb.app";
const MONTHLY_MAX_TRIALS = 5;
const RECENT_TRIAL_SYNC_WINDOW_MS = 2 * 60 * 1000;

const log = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ESTRUTURA-TRIALS] ${step}${detailsStr}`);
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeInstagramUsername = (value: string) => value.trim().toLowerCase().replace(/^@/, '');

const isRecentTrialRecord = (createdAt: string, now = new Date()) => {
  const createdAtMs = new Date(createdAt).getTime();

  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  return createdAtMs >= now.getTime() - RECENT_TRIAL_SYNC_WINDOW_MS;
};

const getAdjustedRemainingCount = ({
  synced,
  squareRemaining,
  recentLocalCreations,
  fallbackRemaining,
}: {
  synced: boolean;
  squareRemaining: number | null;
  recentLocalCreations: number;
  fallbackRemaining: number;
}) => {
  if (!synced || squareRemaining === null) {
    return fallbackRemaining;
  }

  const recentCappedRemaining = Math.max(0, MONTHLY_MAX_TRIALS - recentLocalCreations);
  return Math.max(0, Math.min(squareRemaining, recentCappedRemaining));
};

const normalizeTimestampMs = (value: unknown): number | null => {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed <= 0) return null;

  return parsed < 1_000_000_000_000 ? Math.round(parsed * 1000) : Math.round(parsed);
};

type SquareTrialEntry = {
  instagram_username: string;
  created_at: string;
  expires_at: string;
  remaining_hours: number;
  remaining_minutes: number;
  duration_hours: number;
  active: boolean;
};

const getSquareTrialEntries = (payload: any, now = new Date()): SquareTrialEntry[] => {
  const rawTrials = payload?.userData?.igTesteUserMro ?? payload?.igTesteUserMro;

  if (!rawTrials || typeof rawTrials !== 'object' || Array.isArray(rawTrials)) {
    return [];
  }

  return Object.entries(rawTrials)
    .flatMap(([instagram, metadata]) => {
      const normalizedInstagram = normalizeInstagramUsername(String(instagram || ''));
      const createdAtMs = normalizeTimestampMs((metadata as any)?.timestamp);
      const durationHours = Math.max(0, toFiniteNumber((metadata as any)?.value) ?? 6);

      if (!normalizedInstagram || !createdAtMs || durationHours <= 0) {
        return [];
      }

      const createdAt = new Date(createdAtMs);
      const expiresAt = new Date(createdAtMs + durationHours * 60 * 60 * 1000);
      const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime());

      return [{
        instagram_username: normalizedInstagram,
        created_at: createdAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        remaining_hours: Math.floor(remainingMs / (1000 * 60 * 60)),
        remaining_minutes: Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)),
        duration_hours: durationHours,
        active: remainingMs > 0,
      }];
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

const getEffectiveSquareTrialsRemaining = (payload: any, squareTrials: SquareTrialEntry[]): number | null => {
  const rawRemaining = getSquareTrialsRemaining(payload);

  if (rawRemaining !== null) {
    return rawRemaining;
  }

  const activeTrialsCount = squareTrials.filter((trial) => trial.active).length;
  return Math.max(0, MONTHLY_MAX_TRIALS - activeTrialsCount);
};

const getSquareTrialsRemaining = (payload: any): number | null => {
  const candidates = [
    payload?.userData?.testsRemainingMonth,
    payload?.testsRemainingMonth,
    payload?.userData?.testesRestantesMes,
    payload?.testesRestantesMes,
    payload?.userData?.remainingTrials,
    payload?.remainingTrials,
  ];

  for (const candidate of candidates) {
    const parsed = toFiniteNumber(candidate);
    if (parsed !== null) {
      return Math.max(0, Math.min(MONTHLY_MAX_TRIALS, parsed));
    }
  }

  return null;
};

const getSquareSyncMessage = (reason: string) => {
  switch (reason) {
    case 'missing_password':
      return 'Não foi possível confirmar o saldo de testes na SquareCloud agora.';
    case 'invalid_credentials':
      return 'Não foi possível validar suas credenciais na SquareCloud. Entre novamente.';
    default:
      return 'Não foi possível confirmar o saldo de testes na SquareCloud agora.';
  }
};

const fetchSquareUserRecord = async (mro_username: string) => {
  try {
    const response = await fetch(`${SQUARE_API_URL}/obter-usuarios`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const text = await response.text();
    if (text.trim().startsWith('<!')) return null;

    const payload = JSON.parse(text);
    const users = Array.isArray(payload?.usuarios) ? payload.usuarios : [];

    return users.find((user: any) => String(user?.ID || '').trim().toLowerCase() === mro_username.trim().toLowerCase()) || null;
  } catch (error) {
    log('Failed to fetch SquareCloud user record', {
      mro_username,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const resolveSquareCredentials = async (mro_username: string, mro_password?: string) => {
  if (mro_password?.trim()) {
    return {
      username: mro_username,
      password: mro_password.trim(),
      source: 'request',
    };
  }

  const squareUser = await fetchSquareUserRecord(mro_username);
  const fallbackPassword = typeof squareUser?.data?.numero === 'string' ? squareUser.data.numero.trim() : '';

  return {
    username: String(squareUser?.ID || mro_username),
    password: fallbackPassword || null,
    source: fallbackPassword ? 'square_lookup' : 'missing',
  };
};

const fetchSquareTrialStatus = async (mro_username: string, mro_password?: string) => {
  const credentials = await resolveSquareCredentials(mro_username, mro_password);

  if (!credentials.password) {
    return {
      synced: false,
      remaining: null,
      square_trials: [],
      resolved_password: null,
      reason: 'missing_password',
      message: getSquareSyncMessage('missing_password'),
    };
  }

  try {
    const body = new URLSearchParams({ nome: credentials.username, numero: credentials.password });
    const checkResponse = await fetch(`${SQUARE_API_URL}/verificar-numero`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!checkResponse.ok) {
      return {
        synced: false,
        remaining: null,
        square_trials: [],
        resolved_password: credentials.password,
        reason: 'http_error',
        message: getSquareSyncMessage('http_error'),
      };
    }

    const text = await checkResponse.text();
    if (text.trim().startsWith('<!')) {
      return {
        synced: false,
        remaining: null,
        square_trials: [],
        resolved_password: credentials.password,
        reason: 'html_response',
        message: getSquareSyncMessage('html_response'),
      };
    }

    const checkData = JSON.parse(text);
    const authenticated = checkData?.senhaCorrespondente;
    const squareTrials = getSquareTrialEntries(checkData);

    if (authenticated === false) {
      return {
        synced: false,
        remaining: null,
        square_trials: squareTrials,
        resolved_password: credentials.password,
        reason: 'invalid_credentials',
        message: getSquareSyncMessage('invalid_credentials'),
      };
    }

    const remaining = getEffectiveSquareTrialsRemaining(checkData, squareTrials);

    if (remaining === null) {
      return {
        synced: false,
        remaining: null,
        square_trials: squareTrials,
        resolved_password: credentials.password,
        reason: 'missing_remaining_field',
        message: getSquareSyncMessage('missing_remaining_field'),
      };
    }

    return {
      synced: true,
      remaining,
      square_trials: squareTrials,
      resolved_password: credentials.password,
      reason: null,
      message: null,
    };
  } catch (e) {
    return {
      synced: false,
      remaining: null,
      square_trials: [],
      resolved_password: credentials.password,
      reason: 'request_failed',
      message: getSquareSyncMessage('request_failed'),
    };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, mro_username, mro_password, instagram_username, client_name, client_whatsapp, client_email } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!mro_username) {
      return new Response(
        JSON.stringify({ success: false, message: 'Usuário MRO não informado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // ── LIST TRIALS ──
    if (action === 'list') {
      log("Listing trials", { mro_username });

      // Get trial settings for limits
      const { data: settings } = await supabase
        .from('free_trial_settings')
        .select('trial_duration_hours')
        .limit(1)
        .single();

      const trialHours = settings?.trial_duration_hours || 6;

      // Get all trials for this MRO user from Supabase
      const { data: trials, error } = await supabase
        .from('free_trial_registrations')
        .select('*')
        .eq('mro_master_user', mro_username)
        .order('created_at', { ascending: false });

      if (error) {
        log("Error fetching trials", { error });
        return new Response(
          JSON.stringify({ success: false, message: 'Erro ao carregar testes' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      const now = new Date();

      const squareStatus = await fetchSquareTrialStatus(mro_username, mro_password);
      log('SquareCloud trial sync status', squareStatus);

      const activeSquareTrials = (squareStatus.square_trials || []).filter((trial: SquareTrialEntry) => trial.active);
      const squareTrialsByInstagram = new Map<string, SquareTrialEntry[]>();

      for (const trial of activeSquareTrials) {
        const key = normalizeInstagramUsername(trial.instagram_username);
        const existing = squareTrialsByInstagram.get(key) || [];
        existing.push(trial);
        squareTrialsByInstagram.set(key, existing);
      }

      const sortedTrials = [...(trials || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const mappedTrials = sortedTrials.map(t => {
        const instagramKey = normalizeInstagramUsername(t.instagram_username || '');
        const matchingSquareTrials = squareTrialsByInstagram.get(instagramKey) || [];
        const squareTrial = matchingSquareTrials.shift() || null;

        if (matchingSquareTrials.length === 0) {
          squareTrialsByInstagram.delete(instagramKey);
        } else {
          squareTrialsByInstagram.set(instagramKey, matchingSquareTrials);
        }

        const expiresAt = squareTrial ? new Date(squareTrial.expires_at) : new Date(t.expires_at);
        const isExpired = squareTrial ? false : now > expiresAt;
        const isRemoved = squareTrial ? false : t.instagram_removed === true;
        let remainingMs = expiresAt.getTime() - now.getTime();
        if (remainingMs < 0) remainingMs = 0;

        return {
          id: t.id,
          instagram_username: t.instagram_username,
          full_name: t.full_name,
          email: t.email,
          whatsapp: t.whatsapp,
          created_at: squareTrial?.created_at || t.created_at,
          expires_at: squareTrial?.expires_at || t.expires_at,
          status: isExpired || isRemoved ? 'expired' : 'active',
          remaining_hours: squareTrial ? squareTrial.remaining_hours : Math.floor(remainingMs / (1000 * 60 * 60)),
          remaining_minutes: squareTrial ? squareTrial.remaining_minutes : Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)),
          instagram_removed: squareTrial ? false : t.instagram_removed,
        };
      });

      const squareOnlyTrials = Array.from(squareTrialsByInstagram.values())
        .flat()
        .map((trial) => ({
          id: `square-${trial.instagram_username}-${trial.created_at}`,
          instagram_username: trial.instagram_username,
          full_name: 'Cliente Teste',
          email: '',
          whatsapp: '',
          created_at: trial.created_at,
          expires_at: trial.expires_at,
          status: 'active',
          remaining_hours: trial.remaining_hours,
          remaining_minutes: trial.remaining_minutes,
          instagram_removed: false,
        }));

      const mergedTrials = [...mappedTrials, ...squareOnlyTrials].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const dbTrialsLast30Days = (trials || []).filter((trial) => new Date(trial.created_at) > thirtyDaysAgo);
      const trialsLast30Days = mergedTrials.filter(t => new Date(t.created_at) > thirtyDaysAgo).length;
      const dbBasedRemaining = Math.max(0, MONTHLY_MAX_TRIALS - dbTrialsLast30Days.length);
      const recentLocalCreations = (trials || []).filter((trial) => isRecentTrialRecord(trial.created_at, now)).length;
      const effectiveRemaining = getAdjustedRemainingCount({
        synced: squareStatus.synced,
        squareRemaining: squareStatus.remaining,
        recentLocalCreations,
        fallbackRemaining: dbBasedRemaining,
      });
      const effectiveMax = MONTHLY_MAX_TRIALS;

      return new Response(
        JSON.stringify({
          success: true,
          trials: mergedTrials,
          total_generated: mergedTrials.length,
          trials_last_30_days: trialsLast30Days,
          trials_remaining: effectiveRemaining,
          max_trials: effectiveMax,
          trial_duration_hours: trialHours,
          synced_with_square: squareStatus.synced,
          sync_reason: squareStatus.reason,
          sync_message: squareStatus.message,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── CREATE TRIAL ──
    if (action === 'create') {
      if (!instagram_username) {
        return new Response(
          JSON.stringify({ success: false, message: 'Instagram é obrigatório' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const normalizedIG = instagram_username.toLowerCase().replace(/^@/, '').trim();

      if (normalizedIG.length < 1 || !/^[a-zA-Z0-9._]+$/.test(normalizedIG)) {
        return new Response(
          JSON.stringify({ success: false, message: 'Nome de Instagram inválido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Check how many times this Instagram was tested (allow up to 2)
      const { data: existingTrials, count: igCount } = await supabase
        .from('free_trial_registrations')
        .select('id, registered_at', { count: 'exact', head: false })
        .eq('instagram_username', normalizedIG);

      const maxPerIG = 2;
      if ((igCount || 0) >= maxPerIG) {
        return new Response(
          JSON.stringify({
            success: false,
            alreadyTested: true,
            message: `Esta página já usou ${maxPerIG} testes. Não é possível usar mais. Entre em contato com o admin.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check 30-day limit
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const { count } = await supabase
        .from('free_trial_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('mro_master_user', mro_username)
        .gte('created_at', thirtyDaysAgo.toISOString());

      const squareStatus = await fetchSquareTrialStatus(mro_username, mro_password);
      log('SquareCloud availability check', squareStatus);
      const resolvedPassword = squareStatus.resolved_password || mro_password || '';

      const maxTrials = MONTHLY_MAX_TRIALS;
      const localUsed = count || 0;
      if (!squareStatus.synced) {
        return new Response(
          JSON.stringify({ success: false, message: squareStatus.message, requires_reauth: squareStatus.reason === 'missing_password' || squareStatus.reason === 'invalid_credentials' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      if ((squareStatus.remaining ?? 0) <= 0) {
        return new Response(
          JSON.stringify({ success: false, message: `Limite de testes atingido. Sem testes disponíveis na plataforma.` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (localUsed >= maxTrials && (squareStatus.remaining ?? 0) <= 0) {
        return new Response(
          JSON.stringify({ success: false, message: `Limite de ${maxTrials} testes por 30 dias atingido` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get trial settings
      const { data: settings } = await supabase
        .from('free_trial_settings')
        .select('trial_duration_hours')
        .limit(1)
        .single();

      const trialHours = settings?.trial_duration_hours || 6;

      // Create 6-hour trial via SquareCloud API /criarTesteMro
      log("Creating 6h trial via /criarTesteMro", { mro_username, instagram: normalizedIG });

      let apiTrialResult: any = null;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const trialResponse = await fetch(`${SQUARE_API_URL}/criarTesteMro`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            igAssociada: normalizedIG,
            nameUserMro: mro_username
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const responseText = await trialResponse.text();
        log("API Response", { status: trialResponse.status, body: responseText.substring(0, 500) });

        try {
          apiTrialResult = JSON.parse(responseText);
        } catch {
          return new Response(
            JSON.stringify({ success: false, message: 'Resposta inválida do servidor de automação' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          );
        }

        if (!apiTrialResult.success) {
          return new Response(
            JSON.stringify({ success: false, message: apiTrialResult.message || 'Erro ao criar teste na plataforma' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (apiError: any) {
        const errorMessage = apiError.name === 'AbortError'
          ? 'Tempo limite excedido. Servidor de automação demorando.'
          : 'Erro ao conectar com o servidor de automação.';
        return new Response(
          JSON.stringify({ success: false, message: errorMessage }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Save to database - use 6 hours from API
      const trialHoursFromApi = apiTrialResult.timeLeft || trialHours;
      const apiExpiresAt = new Date();
      apiExpiresAt.setHours(apiExpiresAt.getHours() + trialHoursFromApi);

      const { error: insertError } = await supabase
        .from('free_trial_registrations')
        .insert({
          full_name: client_name || 'Cliente Teste',
          email: (client_email || `${normalizedIG}@teste.mro`).toLowerCase(),
          whatsapp: client_whatsapp || '00000000000',
          instagram_username: normalizedIG,
          generated_username: mro_username,
          generated_password: resolvedPassword,
          mro_master_user: mro_username,
          expires_at: apiExpiresAt.toISOString(),
          email_sent: false,
          instagram_removed: false,
        });

      if (insertError) {
        log("Insert error", { error: insertError });
        return new Response(
          JSON.stringify({ success: false, message: 'Erro ao salvar registro' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      log("Trial created", { instagram: normalizedIG, expires: apiExpiresAt.toISOString(), timeLeft: trialHoursFromApi });

      const remainingAfterCreate = squareStatus.synced
        ? Math.max(0, (squareStatus.remaining ?? maxTrials) - 1)
        : Math.max(0, maxTrials - (localUsed + 1));

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Teste de 6 horas criado com sucesso!',
          trials_remaining: remainingAfterCreate,
          trial: {
            instagram_username: normalizedIG,
            created_at: now.toISOString(),
            expires_at: apiExpiresAt.toISOString(),
            trial_duration_hours: trialHoursFromApi,
            totalUserMes: apiTrialResult.totalUserMes,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: 'Ação inválida' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    log('Error', { error: error instanceof Error ? error.message : 'Unknown' });
    return new Response(
      JSON.stringify({ success: false, message: 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
