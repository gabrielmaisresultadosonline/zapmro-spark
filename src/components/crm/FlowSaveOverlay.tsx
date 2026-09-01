import React, { useEffect, useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FlowSaveOverlayProps {
  /** Exibe o overlay enquanto o fluxo está sendo gravado/recarregado. */
  open: boolean;
  /** Quando true, mostra o estado final "Fluxo salvo!". */
  done?: boolean;
}

/**
 * Overlay de feedback exibido ao salvar um fluxo.
 *
 * Existe porque a gravação + recarga dos fluxos leva alguns segundos; sem
 * feedback o usuário reabria o fluxo antes da atualização e via a versão antiga.
 */
export const FlowSaveOverlay: React.FC<FlowSaveOverlayProps> = ({ open, done = false }) => {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    if (!open) {
      setProgress(8);
      return;
    }
    if (done) {
      setProgress(100);
      return;
    }
    // Avança de forma assintótica: nunca chega a 100% antes da confirmação.
    const timer = window.setInterval(() => {
      setProgress((prev) => (prev >= 92 ? 92 : prev + Math.max(1, (92 - prev) * 0.18)));
    }, 120);
    return () => window.clearInterval(timer);
  }, [open, done]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="status"
      aria-live="polite"
      aria-busy={!done}
    >
      <div className="w-[min(22rem,90vw)] rounded-2xl border border-border bg-card p-6 shadow-2xl text-center">
        <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center">
          {!done && (
            <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" aria-hidden="true" />
          )}
          <span
            className={cn(
              "relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform duration-300",
              !done && "animate-pulse-slow",
              done && "scale-105",
            )}
          >
            {done ? (
              <Check className="h-8 w-8" aria-hidden="true" />
            ) : (
              <MessageCircle className="h-8 w-8" aria-hidden="true" />
            )}
          </span>
        </div>

        <p className="text-base font-semibold text-foreground">
          {done ? "Fluxo salvo!" : "Salvando fluxo..."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {done ? "Tudo atualizado. Você já pode reabrir o fluxo." : "Atualizando seus blocos no WhatsApp."}
        </p>

        <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full bg-primary transition-all duration-300 ease-out",
              !done && "animate-shimmer bg-[length:200%_100%]",
            )}
            style={{ width: `${Math.round(progress)}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default FlowSaveOverlay;
