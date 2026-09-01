import React, { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/mediaUrl";

export interface FlowMediaProps {
  /** Tipo de mídia a renderizar. */
  kind: "image" | "video";
  /** URL bruta salva no fluxo (pode apontar para o Storage antigo). */
  url: unknown;
  /** Classes do contêiner (tamanho/arredondamento). */
  className?: string;
  /** Texto alternativo da imagem. */
  alt?: string;
}

/**
 * Prévia de mídia usada no editor de fluxos.
 *
 * Motivo de existir: mídias antigas foram salvas com a URL pública do Storage
 * anterior (host interno ou *.supabase.co). `resolveMediaUrl` reescreve essas
 * URLs para o Storage atual — sem isso, a prévia aparece quebrada mesmo com o
 * arquivo existindo. Quando o arquivo realmente não existe, mostramos um
 * estado explícito em vez do ícone quebrado do navegador.
 */
export const FlowMedia: React.FC<FlowMediaProps> = ({ kind, url, className, alt = "Prévia da mídia" }) => {
  const resolved = resolveMediaUrl(url);
  const [failed, setFailed] = useState(false);

  // Nova URL => nova tentativa de carregamento.
  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  if (!resolved || failed) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground overflow-hidden",
          className,
        )}
        role="img"
        aria-label={resolved ? "Mídia indisponível" : "Sem mídia"}
      >
        <ImageOff className="w-4 h-4" aria-hidden="true" />
        <span className="text-[8px] leading-none text-center px-1">
          {resolved ? "Mídia indisponível" : "Sem mídia"}
        </span>
      </div>
    );
  }

  if (kind === "video") {
    return (
      <video
        src={resolved}
        className={cn("object-cover bg-muted", className)}
        muted
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      loading="lazy"
      className={cn("object-cover bg-muted", className)}
      onError={() => setFailed(true)}
    />
  );
};

export default FlowMedia;
