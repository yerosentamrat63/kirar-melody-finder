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
  const [targetFreq, setTargetFreq] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => () => cleanup(), []);

  function cleanup() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    streamRef.current = null;
    rafRef.current = null;
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

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const f = autoCorrelate(buf, ctx.sampleRate);
        if (f > 50 && f < 2000) {
          const result = freqToNote(f);
          setNote(result.note);
          setOctave(result.octave);
          setCents(result.cents);
          setFreq(Math.round(f * 10) / 10);
          setTargetFreq(result.freq);
        } else {
          setNote("—");
          setOctave(0);
          setCents(0);
          setFreq(0);
          setTargetFreq(0);
        }
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

  const centsPct = Math.max(-50, Math.min(50, cents)) / 50;
  const inTune = Math.abs(cents) <= 3;
  const close = Math.abs(cents) <= 10 && !inTune;

  return (
    <div className="parchment-bg min-h-screen pb-20 font-sans text-text-primary">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-500/60">
            <span className="inline-block h-px w-6 bg-amber-500/30" />
            tuner
            <span className="inline-block h-px w-6 bg-amber-500/30" />
          </div>
          <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
            Chromatic{" "}
            <span className="text-gradient-gold">Tuner</span>
          </h1>
          <p className="mt-3 font-sans text-sm text-text-secondary sm:text-base">
            Tune your kirar or begena — pluck a string and watch the display.
          </p>
        </header>

        <section className="manuscript-card rounded-xl p-6 sm:p-8">
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
            <div className="flex flex-col items-center gap-6">
              <button
                onClick={stop}
                className="btn-outline rounded-lg px-5 py-2 text-xs tracking-wide"
              >
                Stop Tuner
              </button>

              <div className="flex items-baseline gap-1.5">
                <span className={`font-serif text-7xl font-bold tracking-tight transition-colors duration-150 sm:text-8xl ${
                  inTune ? "text-amber-400" : close ? "text-amber-500/80" : "text-text-primary"
                }`}>
                  {note}
                </span>
                <span className="font-mono text-xl text-text-muted">{octave}</span>
              </div>

              {freq > 0 && (
                <p className="font-mono text-xs tracking-wide text-text-muted">
                  {freq} Hz{" "}
                  {targetFreq > 0 && (
                    <>&middot; target {targetFreq} Hz</>
                  )}
                </p>
              )}

              <div className="w-full max-w-xs">
                <div className="relative h-2 rounded-full bg-amber-500/15">
                  <div
                    className={`absolute top-0 h-full rounded-full transition-all duration-100 ${
                      inTune ? "bg-amber-400" : close ? "bg-amber-500/70" : "bg-amber-500/40"
                    }`}
                    style={{
                      left: "50%",
                      width: `${Math.abs(centsPct) * 50}%`,
                      transform: centsPct < 0 ? "translateX(-100%)" : "translateX(0)",
                    }}
                  />
                  <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 rounded-full bg-amber-500/50" />
                </div>
                <div className="mt-1 flex justify-between text-[10px] font-mono text-text-muted">
                  <span>-50¢</span>
                  <span className={inTune ? "font-bold text-amber-400" : ""}>
                    {cents > 0 ? "+" : ""}{cents}¢
                  </span>
                  <span>+50¢</span>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-1">
                {PITCH_NAMES.map((n, i) => (
                  <span
                    key={i}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-xs font-mono transition-all duration-150 ${
                      n === note
                        ? inTune
                          ? "bg-amber-500 text-ink shadow-sm shadow-amber-500/40 scale-110"
                          : "border border-amber-500/50 bg-amber-500/15 text-amber-300"
                        : "text-text-muted"
                    }`}
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
