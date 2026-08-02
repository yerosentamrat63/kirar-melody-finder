import { useCallback, useRef, useEffect } from "react";

interface RangeSliderProps {
  min: number;
  max: number;
  step: number;
  start: number;
  end: number;
  maxSeconds?: number;
  onStartChange: (v: number) => void;
  onEndChange: (v: number) => void;
}

export function RangeSlider({ min, max, step, start, end, maxSeconds, onStartChange, onEndChange }: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | null>(null);
  const lastEvent = useRef<PointerEvent | null>(null);
  const rafId = useRef<number | null>(null);

  const valueFromClient = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const steps = Math.round((pct * (max - min)) / step);
      return Math.round((min + steps * step) * 10) / 10;
    },
    [min, max, step],
  );

  const onPointer = useCallback(
    (e: React.PointerEvent) => {
      const thumb = (e.target as HTMLElement).closest("[data-thumb]") as HTMLElement | null;
      if (!thumb) return;
      dragging.current = thumb.dataset.thumb as "start" | "end";
      thumb.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      lastEvent.current = e;
      if (rafId.current != null) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        const ev = lastEvent.current;
        if (!ev || !dragging.current || !trackRef.current) return;
        const v = valueFromClient(ev.clientX);
        if (dragging.current === "start") onStartChange(v);
        else onEndChange(v);
      });
    };
    const onUp = () => {
      dragging.current = null;
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      lastEvent.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, [valueFromClient, onStartChange, onEndChange]);

  const startPct = ((start - min) / (max - min)) * 100;
  const endPct = ((end - min) / (max - min)) * 100;

  return (
    <div className="flex items-center gap-3">
      <span className="w-10 text-right text-[11px] font-mono text-emerald-200/60">
        {(start / 100 * (maxSeconds ?? 60)).toFixed(1)}s
      </span>
      <div
        ref={trackRef}
        className="relative h-10 flex-1 cursor-pointer touch-none select-none"
        onPointerDown={onPointer}
      >
        <div className="absolute left-0 right-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-emerald-500/15" />
        <div
          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-emerald-500/40"
          style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
        />
        <div
          data-thumb="start"
          className="absolute top-1/2 z-10 h-9 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-[5px] border-2 border-emerald-400 bg-emerald-50 shadow-md active:cursor-grabbing"
          style={{ left: `${startPct}%` }}
        >
          <svg viewBox="0 0 18 24" className="h-full w-full fill-[#333]">
            <path d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z" />
          </svg>
        </div>
        <div
          data-thumb="end"
          className="absolute top-1/2 z-10 h-9 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-[5px] border-2 border-emerald-400 bg-emerald-50 shadow-md active:cursor-grabbing"
          style={{ left: `${endPct}%` }}
        >
          <svg viewBox="0 0 18 24" className="h-full w-full fill-[#333]">
            <path d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z" />
          </svg>
        </div>
      </div>
      <span className="w-10 text-left text-[11px] font-mono text-emerald-200/60">
        {(end / 100 * (maxSeconds ?? 60)).toFixed(1)}s
      </span>
    </div>
  );
}
