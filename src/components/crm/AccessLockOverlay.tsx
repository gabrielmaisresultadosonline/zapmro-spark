import { useEffect, useState } from "react";
import { Lock, MessageCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_WHATSAPP = "555192835863";
const CHECK_INTERVAL_MS = 20000;

type LockState = {
  locked: boolean;
  reason: string | null;
};

/**
 * Verifica periodicamente se o administrador travou o acesso do usuário
 * (crm_profiles.access_locked). Enquanto travado, exibe um popup em tela
 * cheia que NÃO pode ser fechado — apenas o /admincentral destrava.
 */
export default function AccessLockOverlay() {
  const [state, setState] = useState<LockState>({ locked: false, reason: null });
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function check() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) return;

        const { data, error } = await supabase
          .from("crm_profiles")
          .select("access_locked, access_lock_reason")
          .eq("user_id", userId)
          .maybeSingle();

        if (error || cancelled) return;

        setState({
          locked: (data as any)?.access_locked === true,
          reason: ((data as any)?.access_lock_reason as string | null) ?? null,
        });
      } catch (err) {
        // Falha de rede não deve travar o usuário indevidamente.
        console.warn("[AccessLockOverlay] falha ao verificar travamento:", err);
      }
    }

    void check();
    timer = window.setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  // Bloqueia scroll do body enquanto travado
  useEffect(() => {
    if (!state.locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [state.locked]);

  if (!state.locked) return null;

  const message = encodeURIComponent(
    "Ola, meu acesso ao ZAPMRO OFICIAL foi TRAVADO e preciso normalizar."
  );

  async function recheck() {
    setChecking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from("crm_profiles")
        .select("access_locked, access_lock_reason")
        .eq("user_id", userId)
        .maybeSingle();
      setState({
        locked: (data as any)?.access_locked === true,
        reason: ((data as any)?.access_lock_reason as string | null) ?? null,
      });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      onKeyDown={(e) => e.preventDefault()}
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border-2 border-red-200 bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-red-600 to-orange-500 p-6 text-center text-white">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black">Seu acesso foi travado</h1>
          <p className="mt-1 text-sm text-white/90">
            Entre em contato com nossa administração para normalizar!
          </p>
        </div>

        <div className="space-y-4 p-6">
          {state.reason && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <span className="font-semibold">Motivo:</span> {state.reason}
            </div>
          )}

          <a
            href={`https://wa.me/${ADMIN_WHATSAPP}?text=${message}`}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 py-3 font-bold text-white transition hover:bg-green-700"
          >
            <MessageCircle className="h-5 w-5" /> Falar com a administração
          </a>

          <button
            type="button"
            onClick={recheck}
            disabled={checking}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-green-600 py-2.5 font-semibold text-green-700 transition hover:bg-green-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} /> Já resolvi, verificar novamente
          </button>

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/crm/login";
            }}
            className="w-full pt-1 text-xs text-slate-400 hover:text-slate-600"
          >
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}
