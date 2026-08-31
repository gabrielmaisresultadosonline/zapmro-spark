import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { resolveShortLink } from "@/lib/shortLink";

/** Rota pública /l/:code — resolve o destino e redireciona. */
const ShortLinkRedirect = () => {
  const { code } = useParams<{ code: string }>();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const target = await resolveShortLink(code || "");
      if (cancelled) return;
      if (target) {
        window.location.replace(target);
        return;
      }
      setNotFound(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-foreground px-6 text-center">
      {notFound ? (
        <>
          <h1 className="text-xl font-semibold">Link não encontrado</h1>
          <p className="text-sm text-muted-foreground">Este link expirou ou nunca existiu.</p>
        </>
      ) : (
        <>
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Redirecionando…</p>
        </>
      )}
    </main>
  );
};

export default ShortLinkRedirect;
