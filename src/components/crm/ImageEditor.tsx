import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pencil, Circle as CircleIcon, Square, Type, Undo2, Eraser, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = "pencil" | "circle" | "rect" | "text";

interface ImageEditorProps {
  open: boolean;
  imageUrl: string | null;
  onCancel: () => void;
  onSave: (blob: Blob, previewUrl: string) => void;
}

const COLORS = ["#ef4444", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#000000", "#ffffff"];

export const ImageEditor = ({ open, imageUrl, onCancel, onSave }: ImageEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const snapshotRef = useRef<ImageData | null>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState<string>("#ef4444");
  const [size, setSize] = useState<number>(4);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    if (!open || !imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = 1280;
      const scale = img.width > maxW ? maxW / img.width : 1;
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      baseImageRef.current = img;
      historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
    };
    img.src = imageUrl;
  }, [open, imageUrl]);

  const pushHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > 30) historyRef.current.shift();
  };

  const undo = () => {
    const canvas = canvasRef.current;
    if (!canvas || historyRef.current.length <= 1) return;
    historyRef.current.pop();
    const last = historyRef.current[historyRef.current.length - 1];
    canvas.getContext("2d")!.putImageData(last, 0, 0);
  };

  const reset = () => {
    const canvas = canvasRef.current;
    if (!canvas || historyRef.current.length === 0) return;
    canvas.getContext("2d")!.putImageData(historyRef.current[0], 0, 0);
    historyRef.current = [historyRef.current[0]];
  };

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext("2d")!;
    const p = getPos(e);
    startRef.current = p;

    if (tool === "text") {
      const text = window.prompt("Texto:");
      if (text) {
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.max(16, size * 6)}px system-ui, sans-serif`;
        ctx.fillText(text, p.x, p.y);
        pushHistory();
      }
      startRef.current = null;
      return;
    }

    if (tool === "pencil") {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      setDrawing(true);
      return;
    }

    // shape: snapshot for live preview
    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setDrawing(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const p = getPos(e);

    if (tool === "pencil") {
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      return;
    }
    if (!startRef.current || !snapshotRef.current) return;
    ctx.putImageData(snapshotRef.current, 0, 0);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    const s = startRef.current;
    if (tool === "rect") {
      ctx.strokeRect(s.x, s.y, p.x - s.x, p.y - s.y);
    } else if (tool === "circle") {
      const cx = (s.x + p.x) / 2;
      const cy = (s.y + p.y) / 2;
      const rx = Math.abs(p.x - s.x) / 2;
      const ry = Math.abs(p.y - s.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const onPointerUp = () => {
    if (!drawing) return;
    setDrawing(false);
    startRef.current = null;
    snapshotRef.current = null;
    pushHistory();
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      onSave(blob, url);
    }, "image/png", 0.95);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar imagem antes de enviar</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border rounded-lg p-2 bg-muted/30">
          <div className="flex gap-1">
            {([
              { t: "pencil", icon: Pencil, label: "Lápis" },
              { t: "circle", icon: CircleIcon, label: "Círculo" },
              { t: "rect", icon: Square, label: "Retângulo" },
              { t: "text", icon: Type, label: "Texto" },
            ] as const).map(({ t, icon: Icon, label }) => (
              <Button
                key={t}
                type="button"
                variant={tool === t ? "default" : "outline"}
                size="sm"
                onClick={() => setTool(t)}
                title={label}
              >
                <Icon className="w-4 h-4" />
              </Button>
            ))}
          </div>

          <div className="flex gap-1 items-center ml-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition",
                  color === c ? "border-primary scale-110" : "border-transparent"
                )}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-muted-foreground">Traço</span>
            <input
              type="range"
              min={2}
              max={20}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-24"
            />
          </div>

          <div className="flex gap-1 ml-auto">
            <Button type="button" variant="outline" size="sm" onClick={undo} title="Desfazer">
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={reset} title="Limpar edições">
              <Eraser className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto flex items-center justify-center bg-black/40 rounded-lg p-2">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="max-w-full max-h-[65vh] touch-none cursor-crosshair bg-white rounded shadow-lg"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={save} className="bg-green-600 hover:bg-green-700 text-white">
            <Send className="w-4 h-4 mr-2" /> Usar imagem editada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
