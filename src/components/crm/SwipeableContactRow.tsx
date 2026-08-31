import { useRef, useState, useEffect, ReactNode } from "react";
import { Eraser, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SwipeableContactRowProps {
  children: ReactNode;
  onClear: () => void;
  onDelete: () => void;
}

const ACTION_WIDTH = 160; // 80px per button
const OPEN_THRESHOLD = 50;

export const SwipeableContactRow = ({ children, onClear, onDelete }: SwipeableContactRowProps) => {
  const [translateX, setTranslateX] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startTranslateRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setTranslateX(0);
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isOpen]);

  const onPointerDown = (e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    startTranslateRef.current = translateX;
    draggedRef.current = false;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    if (Math.abs(dx) > 5) draggedRef.current = true;
    let next = startTranslateRef.current + dx;
    if (next > 0) next = 0;
    if (next < -ACTION_WIDTH) next = -ACTION_WIDTH;
    setTranslateX(next);
  };

  const onPointerUp = () => {
    if (startXRef.current === null) return;
    startXRef.current = null;
    if (translateX < -OPEN_THRESHOLD) {
      setTranslateX(-ACTION_WIDTH);
      setIsOpen(true);
    } else {
      setTranslateX(0);
      setIsOpen(false);
    }
  };

  const close = () => {
    setTranslateX(0);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative overflow-hidden select-none">
      {/* Action buttons revealed behind */}
      <div className="absolute inset-y-0 right-0 flex items-stretch z-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
            close();
          }}
          className="w-20 flex flex-col items-center justify-center gap-1 bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          title="Limpar mensagens"
        >
          <Eraser className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Limpar</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
            close();
          }}
          className="w-20 flex flex-col items-center justify-center gap-1 bg-red-600 text-white hover:bg-red-700 transition-colors"
          title="Apagar conversa"
        >
          <Trash2 className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Apagar</span>
        </button>
      </div>

      {/* Foreground row, draggable */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          // After a swipe, the browser still fires a click on the row.
          // Suppress that synthetic click, but keep the action buttons visible
          // until the user swipes the row back or opens another conversation.
          if (draggedRef.current) {
            e.stopPropagation();
            e.preventDefault();
            draggedRef.current = false;
            return;
          }

          if (isOpen) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        style={{ transform: `translateX(${translateX}px)` }}
        className={cn(
          "relative z-10 bg-background touch-pan-y",
          startXRef.current === null ? "transition-transform duration-200 ease-out" : ""
        )}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeableContactRow;