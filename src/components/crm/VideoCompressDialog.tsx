import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Loader2, Scissors, Play, Pause, Wand2, X, Upload } from "lucide-react";
import { compressVideoForWhatsApp, WHATSAPP_VIDEO_MAX_BYTES } from "@/lib/videoCompress";
import { cn } from "@/lib/utils";

interface VideoCompressDialogProps {
  file: File | null;
  limitMb: number;
  open: boolean;
  onCancel: () => void;
  onReady: (compressed: File) => Promise<void> | void;
}

type Phase = "ready" | "compressing" | "done" | "error" | "uploading";

function fmtTime(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const WHATSAPP_VIDEO_MAX_MB = WHATSAPP_VIDEO_MAX_BYTES / 1_000_000;
const WHATSAPP_VIDEO_TARGET_BYTES = Math.floor(WHATSAPP_VIDEO_MAX_BYTES * 0.97);

export const VideoCompressDialog = ({ file, limitMb, open, onCancel, onReady }: VideoCompressDialogProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<Phase>("ready");
  const [progress, setProgress] = useState(0);
  const [resultMb, setResultMb] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const originalMb = useMemo(() => (file ? file.size / (1024 * 1024) : 0), [file]);

  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    setPhase("ready");
    setProgress(0);
    setResultMb(null);
    setError(null);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      const d = v.duration || 0;
      setDuration(d);
      setTrim([0, d]);
    };
    const onTime = () => {
      setCurrentTime(v.currentTime);
      if (v.currentTime >= trim[1]) {
        v.pause();
        setPlaying(false);
      }
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [url, trim]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < trim[0] || v.currentTime >= trim[1]) v.currentTime = trim[0];
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const handleTrim = (vals: number[]) => {
    const [a, b] = vals as [number, number];
    setTrim([a, Math.max(a + 0.5, b)]);
    const v = videoRef.current;
    if (v && (v.currentTime < a || v.currentTime > b)) v.currentTime = a;
  };

  const handleSeek = (vals: number[]) => {
    const v = videoRef.current;
    if (!v) return;
    const t = Math.min(Math.max(vals[0], trim[0]), trim[1]);
    v.currentTime = t;
    setCurrentTime(t);
  };

  const trimmedDur = trim[1] - trim[0];
  const estimatedMb = useMemo(() => {
    if (!duration || !originalMb) return 0;
    // estimativa proporcional pelo trim, mas limitada pela margem segura da Meta
    const proportional = (trimmedDur / duration) * originalMb;
    return Math.min(proportional, WHATSAPP_VIDEO_TARGET_BYTES / (1024 * 1024));
  }, [trimmedDur, duration, originalMb, limitMb]);

  const runCompress = async () => {
    if (!file) return;
    setPhase("compressing");
    setProgress(0);
    setError(null);
    const v = videoRef.current;
    const prevMuted = v?.muted;
    const prevVolume = v?.volume;
    if (v) { v.muted = true; v.volume = 0; }
    try {
      const compressed = await compressVideoForWhatsApp(
        file,
        (p) => setProgress(p),
        { startTime: trim[0], endTime: trim[1], targetBytes: WHATSAPP_VIDEO_TARGET_BYTES, maxBytes: WHATSAPP_VIDEO_MAX_BYTES }
      );
      const mb = compressed.size / (1024 * 1024);
      setResultMb(mb);
      if (compressed.size <= WHATSAPP_VIDEO_MAX_BYTES) {
        setPhase("uploading");
        await onReady(compressed);
        setPhase("done");
      } else {
        setPhase("done");
      }
    } catch (e: any) {
      setError(e?.message || "Erro ao comprimir");
      setPhase("error");
    } finally {
      if (v) {
        v.muted = prevMuted ?? false;
        v.volume = prevVolume ?? 1;
      }
    }
  };

  const closeAllowed = phase !== "compressing" && phase !== "uploading";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && closeAllowed) onCancel(); }}>
      <DialogContent className="max-w-2xl w-[95vw] p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Comprimir vídeo
          </DialogTitle>
          <DialogDescription>
            {originalMb.toFixed(1)}MB · WhatsApp aceita até {WHATSAPP_VIDEO_MAX_MB.toFixed(0)}MB. Visualize, corte e comprima sem sair daqui.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-4">
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
            {url && (
              <video
                ref={videoRef}
                src={url}
                className="w-full h-full object-contain"
                onClick={togglePlay}
                playsInline
              />
            )}
            <button
              type="button"
              onClick={togglePlay}
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-opacity",
                playing ? "opacity-0 hover:opacity-100" : "opacity-100"
              )}
            >
              <div className="bg-black/60 backdrop-blur rounded-full p-3 sm:p-4">
                {playing ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white" />}
              </div>
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <Scissors className="w-4 h-4" /> Cortar trecho
              </span>
              <span className="text-muted-foreground tabular-nums">
                {fmtTime(trim[0])} → {fmtTime(trim[1])} ({fmtTime(trimmedDur)})
              </span>
            </div>
            <SliderPrimitive.Root
              min={0}
              max={Math.max(duration, 0.5)}
              step={0.1}
              value={trim}
              onValueChange={handleTrim}
              disabled={phase === "compressing" || phase === "uploading" || !duration}
              className="relative flex w-full touch-none select-none items-center"
            >
              <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
                <SliderPrimitive.Range className="absolute h-full bg-primary" />
              </SliderPrimitive.Track>
              <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background shadow ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
              <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background shadow ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
            </SliderPrimitive.Root>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Início</span>
              <span>Fim</span>
            </div>

            <div className="pt-2 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Posição atual</span>
                <span className="tabular-nums">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
              </div>
              <SliderPrimitive.Root
                min={trim[0]}
                max={Math.max(trim[1], trim[0] + 0.1)}
                step={0.05}
                value={[Math.min(Math.max(currentTime, trim[0]), trim[1])]}
                onValueChange={handleSeek}
                disabled={phase === "compressing" || phase === "uploading" || !duration}
                className="relative flex w-full touch-none select-none items-center"
              >
                <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
                  <SliderPrimitive.Range className="absolute h-full bg-primary/70" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-primary bg-background shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
              </SliderPrimitive.Root>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border bg-card p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Original</div>
              <div className="font-semibold text-sm">{originalMb.toFixed(1)}MB</div>
            </div>
            <div className="rounded-md border bg-card p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Estimado</div>
              <div className="font-semibold text-sm">~{estimatedMb.toFixed(1)}MB</div>
            </div>
            <div className="rounded-md border bg-card p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Resultado</div>
              <div className={cn("font-semibold text-sm", resultMb && resultMb * 1024 * 1024 > WHATSAPP_VIDEO_MAX_BYTES ? "text-destructive" : resultMb ? "text-green-600" : "text-muted-foreground")}>
                {resultMb ? `${resultMb.toFixed(1)}MB` : "—"}
              </div>
            </div>
          </div>

          {(phase === "compressing" || phase === "uploading") && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {phase === "compressing" ? `Comprimindo... ${progress}%` : "Enviando para a nuvem..."}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${phase === "uploading" ? 100 : progress}%` }}
                />
              </div>
            </div>
          )}

          {phase === "done" && resultMb && resultMb * 1024 * 1024 > WHATSAPP_VIDEO_MAX_BYTES && (
            <div className="text-sm text-destructive">
              Ainda acima de {WHATSAPP_VIDEO_MAX_MB.toFixed(0)}MB. Corte mais um pedaço e tente novamente.
            </div>
          )}
          {phase === "error" && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} disabled={!closeAllowed}>
              <X className="w-4 h-4 mr-1.5" /> Cancelar
            </Button>
            <Button onClick={runCompress} disabled={phase === "compressing" || phase === "uploading" || !duration}>
              {phase === "compressing" || phase === "uploading" ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Processando</>
              ) : phase === "done" && resultMb && resultMb * 1024 * 1024 > WHATSAPP_VIDEO_MAX_BYTES ? (
                <><Wand2 className="w-4 h-4 mr-1.5" /> Tentar novamente</>
              ) : phase === "done" ? (
                <><Upload className="w-4 h-4 mr-1.5" /> Concluído</>
              ) : (
                <><Wand2 className="w-4 h-4 mr-1.5" /> Comprimir e enviar</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoCompressDialog;