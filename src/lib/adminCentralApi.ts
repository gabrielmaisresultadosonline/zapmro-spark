/**
 * Cliente único das operações do /admincentral.
 *
 * Porquê: cada painel chamava `supabase.functions.invoke("crm-central-admin")`
 * direto. A SDK não tem tempo limite próprio, então qualquer lentidão da VPS
 * (cold start da função, SMTP travado, gateway com 300s de leitura) deixava o
 * botão girando para sempre. Aqui toda chamada tem AbortController + timeout,
 * erro legível e nenhuma repetição automática em operações que escrevem.
 */

export type AdminCreds = { email: string; password: string };

export type AdminResponse<T = Record<string, unknown>> = {
  success: boolean;
  error?: string;
} & T;

/** Tempos limite por natureza da operação (ms). */
export const ADMIN_TIMEOUTS = {
  /** Leituras de tela (listas, insights). */
  read: 20000,
  /** Mutações (travar, liberar plano, excluir, desconectar…). */
  write: 25000,
  /** Exportação/migração, que legitimamente demora mais. */
  export: 120000,
} as const;

export class AdminApiError extends Error {
  readonly kind: "timeout" | "network" | "unauthorized" | "server" | "invalid";
  readonly status?: number;

  constructor(
    message: string,
    kind: AdminApiError["kind"],
    status?: number
  ) {
    super(message);
    this.name = "AdminApiError";
    this.kind = kind;
    this.status = status;
  }
}

/** Um timeout pode ter ocorrido DEPOIS da escrita — a tela precisa reconciliar. */
export function isUnconfirmed(error: unknown): boolean {
  return error instanceof AdminApiError && (error.kind === "timeout" || error.kind === "network");
}

function functionsBaseUrl(): string | null {
  const raw = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/** Identificador da tentativa: permite ao servidor tratar repetição sem duplicar. */
export function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

type CallOptions = {
  timeoutMs?: number;
  requestId?: string;
  /** Nome da função (o login usa uma função leve dedicada). */
  fn?: string;
  signal?: AbortSignal;
};

/**
 * Executa uma ação administrativa. Sempre resolve com o payload da função ou
 * lança AdminApiError — nunca fica pendente indefinidamente.
 */
export async function adminCall<T = Record<string, unknown>>(
  action: string,
  creds: AdminCreds,
  extra: Record<string, unknown> = {},
  options: CallOptions = {}
): Promise<AdminResponse<T>> {
  const {
    timeoutMs = ADMIN_TIMEOUTS.write,
    requestId = newRequestId(),
    fn = "crm-central-admin",
    signal,
  } = options;

  const baseUrl = functionsBaseUrl();
  if (!baseUrl) {
    throw new AdminApiError(
      "Servidor não configurado (VITE_SUPABASE_URL ausente).",
      "invalid"
    );
  }

  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);

  try {
    const response = await fetch(`${baseUrl}/functions/v1/${fn}`, {
      method: "POST",
      // Porquê: `x-request-id` era um cabeçalho personalizado. O preflight
      // (OPTIONS) do navegador só é aprovado se o servidor listar TODOS os
      // cabeçalhos em Access-Control-Allow-Headers — e o gateway da VPS não
      // listava este. O navegador abortava antes de qualquer resposta e a tela
      // mostrava "Falha de rede". O requestId continua indo no corpo, que é de
      // onde o servidor já o lê para idempotência.
      headers: {
        "Content-Type": "application/json",
        ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
      },
      body: JSON.stringify({
        action,
        adminEmail: creds.email,
        adminPassword: creds.password,
        requestId,
        ...extra,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: AdminResponse<T> | null = null;
    try {
      payload = text ? (JSON.parse(text) as AdminResponse<T>) : null;
    } catch {
      payload = null;
    }

    if (response.status === 401) {
      throw new AdminApiError(
        payload?.error || "Credenciais do Admin Central inválidas ou expiradas.",
        "unauthorized",
        401
      );
    }

    if (!payload) {
      throw new AdminApiError(
        response.ok
          ? "Resposta inválida do servidor."
          : `Servidor respondeu HTTP ${response.status}.`,
        response.ok ? "invalid" : "server",
        response.status
      );
    }

    if (!payload.success) {
      throw new AdminApiError(
        payload.error || "Não foi possível concluir a operação.",
        response.status >= 500 ? "server" : "invalid",
        response.status
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    if (timedOut) {
      throw new AdminApiError(
        "O servidor não respondeu no tempo esperado. Use 'Recarregar' para conferir se a alteração foi aplicada.",
        "timeout"
      );
    }
    if ((error as Error)?.name === "AbortError") {
      throw new AdminApiError("Operação cancelada.", "network");
    }
    // "Failed to fetch" cobre dois casos muito diferentes: servidor inacessível
    // e requisição bloqueada pelo navegador (CORS/preflight). Distinguir evita
    // horas de diagnóstico no lugar errado.
    const raw = String((error as Error)?.message || "");
    const blockedByBrowser = /failed to fetch|load failed|networkerror/i.test(raw);
    throw new AdminApiError(
      blockedByBrowser
        ? `Não foi possível contatar o servidor (${new URL(baseUrl).host}). Pode ser conexão fora do ar ou bloqueio de CORS/preflight pelo navegador — confira o console e o gateway.`
        : "Falha de rede ao contatar o servidor. Verifique a conexão e tente novamente.",
      "network"
    );
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Leitura: mesmo contrato, mas com o tempo limite de leitura. */
export function adminRead<T = Record<string, unknown>>(
  action: string,
  creds: AdminCreds,
  extra: Record<string, unknown> = {},
  options: CallOptions = {}
) {
  return adminCall<T>(action, creds, extra, {
    timeoutMs: ADMIN_TIMEOUTS.read,
    ...options,
  });
}

/** Mensagem pronta para toast, já explicando o que fazer. */
export function adminErrorMessage(error: unknown, fallback = "Erro na operação"): string {
  if (error instanceof AdminApiError) return error.message;
  const message = (error as Error)?.message;
  return message || fallback;
}
