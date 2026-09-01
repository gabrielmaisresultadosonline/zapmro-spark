/**
 * Pré-aquecimento de vídeos.
 *
 * Por que existe: os vídeos dos tutoriais vêm do Storage na VPS. O tempo
 * percebido de "demora para abrir" é quase todo o primeiro byte + o primeiro
 * chunk do arquivo. Se, no momento em que o usuário passa o mouse (ou toca) no
 * card, já pedirmos o início do arquivo, o navegador guarda em cache HTTP e o
 * <video> começa a tocar praticamente na hora.
 *
 * Cuidados:
 * - Usa Range para baixar apenas o começo (não o vídeo inteiro).
 * - Memoiza por URL para não disparar a mesma requisição várias vezes.
 * - Falhas são ignoradas de propósito: é otimização, nunca caminho crítico.
 */

const PREFETCHED = new Set<string>();

/** Quantos bytes iniciais buscar — suficiente para moov/atom + 1º chunk. */
const PREFETCH_BYTES = 1_572_864; // 1.5 MB

export function prefetchVideo(url: unknown): void {
  if (typeof url !== "string") return;

  const target = url.trim();
  if (!target || target.startsWith("blob:") || target.startsWith("data:")) return;
  if (PREFETCHED.has(target)) return;
  PREFETCHED.add(target);

  // Conexões limitadas/economia de dados: não desperdiça banda do usuário.
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (conn?.saveData) return;
  if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return;

  try {
    void fetch(target, {
      method: "GET",
      headers: { Range: `bytes=0-${PREFETCH_BYTES - 1}` },
      cache: "force-cache",
      credentials: "omit",
      mode: "cors",
    }).catch(() => {
      // Silencioso: prefetch é best-effort.
    });
  } catch {
    // Ambientes sem fetch/CORS: ignora.
  }
}

/** Handlers prontos para colar em um card clicável. */
export function videoPrefetchHandlers(url: unknown) {
  const run = () => prefetchVideo(url);
  return {
    onMouseEnter: run,
    onFocus: run,
    onTouchStart: run,
  };
}
