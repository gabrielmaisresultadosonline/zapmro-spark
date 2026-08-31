import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/mediaUrl";

interface WhatsAppAudioPlayerProps {
  src: string;
  outbound?: boolean;
}

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// Global playback rate shared across all audio players
let GLOBAL_RATE = 1;
const rateListeners = new Set<(r: number) => void>();
const setGlobalRate = (r: number) => {
  GLOBAL_RATE = r;
  rateListeners.forEach((fn) => fn(r));
};

export function WhatsAppAudioPlayer({ src, outbound = false }: WhatsAppAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [rate, setRate] = useState<number>(GLOBAL_RATE);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const playableSrc = resolveMediaUrl(src);

  useEffect(() => {
    setPlaybackError(false);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  }, [playableSrc]);

  // Subscribe to global rate changes
  useEffect(() => {
    const fn = (r: number) => {
      setRate(r);
      if (audioRef.current) audioRef.current.playbackRate = r;
    };
    rateListeners.add(fn);
    return () => { rateListeners.delete(fn); };
  }, [playableSrc]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = GLOBAL_RATE;
    const onTime = () => setCurrent(a.currentTime);
    const onLoaded = () => setDuration(a.duration || 0);
    const onEnd = () => { setPlaying(false); setCurrent(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      try {
        setPlaybackError(false);
        a.playbackRate = GLOBAL_RATE;
        await a.play();
        setPlaying(true);
        setHasPlayed(true);
      } catch (error) {
        console.error("[CRM][audio] Falha ao reproduzir mídia", { src: playableSrc, error });
        setPlaying(false);
        setPlaybackError(true);
      }
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    const bar = barRef.current;
    if (!a || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = pct * duration;
    setCurrent(a.currentTime);
  };

  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setGlobalRate(next);
  };

  const progress = duration ? (current / duration) * 100 : 0;
  // Static waveform bars (pseudo-random but stable per src)
  const bars = Array.from({ length: 38 }, (_, i) => {
    const seed = (src.length + i * 7) % 17;
    const h = 25 + ((seed * 13) % 70);
    return h;
  });

  const accent = outbound ? "text-white" : "text-[#00a884]";
  const accentBg = outbound ? "bg-white" : "bg-[#00a884]";
  const inactive = outbound ? "bg-white/30" : "bg-foreground/25";
  const showRateBtn = hasPlayed || rate !== 1;

  return (
    <div className={cn(
      "flex items-center gap-2 py-1.5 pl-1 pr-1.5 rounded-full w-full min-w-[180px] max-w-full sm:max-w-[320px]",
    )}>
      <audio ref={audioRef} src={playableSrc} preload="metadata" onError={() => setPlaybackError(true)} />
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95",
          outbound ? "bg-white/90 text-[#005c4b]" : "bg-[#00a884] text-white"
        )}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div
          ref={barRef}
          onClick={seek}
          className="relative h-6 flex items-center gap-[2px] cursor-pointer"
        >
          {bars.map((h, i) => {
            const filled = (i / bars.length) * 100 <= progress;
            return (
              <div
                key={i}
                className={cn("flex-1 rounded-full transition-colors", filled ? accentBg : inactive)}
                style={{ height: `${h}%`, minHeight: 3 }}
              />
            );
          })}
          {/* Drag handle */}
          <div
            className={cn("absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full shadow", accentBg)}
            style={{ left: `calc(${progress}% - 5px)` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] font-medium opacity-70">
          <span>{playbackError ? "Áudio indisponível" : formatTime(playing || current > 0 ? current : duration)}</span>
        </div>
      </div>

      {showRateBtn && (
        <button
          type="button"
          onClick={cycleRate}
          aria-label={`Velocidade ${rate}x`}
          className={cn(
            "shrink-0 text-[11px] font-bold px-2 py-1 rounded-full leading-none transition-all",
            outbound
              ? "bg-white/25 text-white hover:bg-white/35"
              : "bg-foreground/10 text-foreground hover:bg-foreground/20"
          )}
        >
          {rate % 1 === 0 ? `${rate}x` : `${rate}x`}
        </button>
      )}
    </div>
  );
}

export default WhatsAppAudioPlayer;