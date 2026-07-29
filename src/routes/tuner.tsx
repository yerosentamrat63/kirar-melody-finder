import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { autoCorrelate, PITCH_NAMES } from "@/lib/pitch";

export const Route = createFileRoute("/tuner")({
  head: () => ({
    meta: [
      { title: "Tuner — ቅኝት Finder" },
      {
        name: "description",
        content: "Chromatic tuner for kirar and begena — tune your instrument.",
      },
    ],
  }),
  component: TunerPage,
});

const A4 = 440;

function freqToNote(freq: number): { note: string; cents: number; octave: number; freq: number } {
  const midi = 12 * (Math.log(freq / A4) / Math.log(2)) + 69;
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const idx = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  const target = A4 * 2 ** ((rounded - 69) / 12);
  return { note: PITCH_NAMES[idx], cents, octave, freq: Math.round(target) };
}

function TunerPage() {
  const [active, setActive] = useState(false);
  const [note, setNote] = useState("—");
  const [octave, setOctave] = useState(0);
  const [cents, setCents] = useState(0);
  const [freq, setFreq] = useState(0);
  const [smoothCents, setSmoothCents] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothCentsRef = useRef(0);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidRef = useRef<{ note: string; octave: number; cents: number; freq: number } | null>(null);

  useEffect(() => () => cleanup(), []);

  function cleanup() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (holdTimeoutRef.current != null) clearTimeout(holdTimeoutRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    streamRef.current = null;
    rafRef.current = null;
    holdTimeoutRef.current = null;
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      setActive(true);

      const holdMs = 500;
      let targetCents = 0;

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const f = autoCorrelate(buf, ctx.sampleRate);

        if (f > 50 && f < 2000) {
          const result = freqToNote(f);
          lastValidRef.current = result;
          targetCents = result.cents;
          if (holdTimeoutRef.current != null) {
            clearTimeout(holdTimeoutRef.current);
            holdTimeoutRef.current = null;
          }
          setNote(result.note);
          setOctave(result.octave);
          setCents(result.cents);
          setFreq(Math.round(f * 10) / 10);
        } else if (lastValidRef.current != null && holdTimeoutRef.current == null) {
          holdTimeoutRef.current = setTimeout(() => {
            lastValidRef.current = null;
            setNote("—");
            setOctave(0);
            setCents(0);
            setFreq(0);
          }, holdMs);
        }

        smoothCentsRef.current += (targetCents - smoothCentsRef.current) * 0.1;
        setSmoothCents(smoothCentsRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone access failed");
    }
  }

  function stop() {
    cleanup();
    setActive(false);
    setNote("—");
    setCents(0);
    setFreq(0);
  }

  const inTune = Math.abs(cents) <= 3;
  const clampedCents = Math.max(-50, Math.min(50, smoothCents));
  const barPct = (clampedCents / 50) * 100;
  const absPct = Math.abs(barPct);

  const barColor =
    Math.abs(cents) <= 3
      ? "bg-amber-400"
      : Math.abs(cents) <= 10
        ? "bg-amber-500/80"
        : Math.abs(cents) <= 25
          ? "bg-amber-600/60"
          : "bg-red-600/50";

  const tickMarks = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];

  return (
    <div className="parchment-bg min-h-screen pb-20 font-sans text-text-primary">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-500/60">
            <span className="inline-block h-px w-6 bg-amber-500/30" />
            tuner
            <span className="inline-block h-px w-6 bg-amber-500/30" />
          </div>
          <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
            Chromatic{" "}
            <span className="text-gradient-gold">Tuner</span>
          </h1>
        </header>

        <section className="manuscript-card rounded-xl p-5 sm:p-6">
          {!active ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <button onClick={start} className="btn-gold rounded-lg px-8 py-3 text-sm tracking-wide">
                Start Tuner
              </button>
              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5">
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-serif text-7xl font-bold tracking-tight sm:text-8xl transition-colors duration-150 ${
                    inTune ? "text-amber-400" : "text-text-primary"
                  }`}
                >
                  {note}
                </span>
                {note !== "—" && (
                  <span className="font-mono text-xl text-text-muted">{octave}</span>
                )}
              </div>

              <div className="w-full max-w-sm">
                <div className="relative flex h-14 items-center">
                  <span className="absolute -left-1 z-10 text-lg text-amber-600/60 select-none">&flat;</span>
                  <span className="absolute -right-1 z-10 text-lg text-amber-600/60 select-none">&sharp;</span>

                  <div className="relative mx-5 w-full h-full">
                    <div className="absolute inset-0 flex items-center">
                      <div className="relative w-full h-8 rounded-full border border-amber-700/20 bg-amber-900/10 overflow-hidden">
                        <div
                          className={`absolute top-0 h-full rounded-full transition-all duration-75 ${barColor}`}
                          style={{
                            left: barPct < 0 ? `${50 + barPct}%` : "50%",
                            width: `${absPct}%`,
                            transform: barPct < 0 ? "translateX(0)" : "translateX(0)",
                          }}
                        />

                        <div className="absolute inset-0 flex items-center justify-center">
                          {tickMarks.map((t) => {
                            const pos = ((t + 50) / 100) * 100;
                            const major = t === 0;
                            return (
                              <div
                                key={t}
                                className="absolute top-0 h-full"
                                style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
                              >
                                <div
                                  className={`${major ? "w-0.5 h-full bg-amber-500/40" : "w-px h-1/2 bg-amber-500/15"}`}
                                  style={{
                                    marginTop: major ? "0" : "25%",
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {note !== "—" && (
                      <div
                        className="absolute bottom-0 flex flex-col items-center transition-all duration-75"
                        style={{ left: `${((clampedCents + 50) / 100) * 100}%`, transform: "translateX(-50%)" }}
                      >
                        <div
                          className={`h-4 w-0.5 rounded-full ${inTune ? "bg-amber-400" : "bg-amber-500/50"}`}
                        />
                        <span
                          className={`mt-1 font-mono text-xs whitespace-nowrap ${
                            inTune ? "text-amber-400 font-bold" : "text-text-muted"
                          }`}
                        >
                          {clampedCents > 0 ? "+" : ""}{Math.round(clampedCents)}&cent;
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {freq > 0 && (
                <p className="font-mono text-xs tracking-wide text-text-muted">
                  {freq} Hz
                </p>
              )}

              <div className="flex flex-wrap justify-center gap-1">
                {PITCH_NAMES.map((n, i) => (
                  <span
                    key={i}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded text-[10px] font-mono transition-all duration-100 ${
                      n === note
                        ? inTune
                          ? "bg-amber-500 text-ink scale-110 shadow-sm shadow-amber-500/30"
                          : "border border-amber-500/40 bg-amber-500/15 text-amber-300"
                        : "text-text-muted"
                    }`}
                  >
                    {n}
                  </span>
                ))}
              </div>

              <button
                onClick={stop}
                className="btn-outline rounded-lg px-5 py-2 text-xs tracking-wide"
              >
                Stop Tuner
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
