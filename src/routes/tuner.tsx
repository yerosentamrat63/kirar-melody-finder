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
  const [needleAngle, setNeedleAngle] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothAngleRef = useRef(0);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidRef = useRef<{ note: string; octave: number; cents: number; freq: number } | null>(null);

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

      const holdMs = 500;
      let targetAngle = 0;

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const f = autoCorrelate(buf, ctx.sampleRate);

        if (f > 50 && f < 2000) {
          const result = freqToNote(f);
          lastValidRef.current = result;
          targetAngle = (result.cents / 50) * 120;
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

        smoothAngleRef.current += (targetAngle - smoothAngleRef.current) * 0.12;
        setNeedleAngle(smoothAngleRef.current);
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
  const angle = needleAngle;

  const needleColor = inTune ? "#f59e0b" : Math.abs(cents) <= 10 ? "#d97706" : "#92400e";

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
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-full max-w-xs">
                <svg viewBox="0 0 300 200" className="w-full">
                  <defs>
                    <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stop-color="#991b1b" />
                      <stop offset="25%" stop-color="#d97706" />
                      <stop offset="45%" stop-color="#f59e0b" />
                      <stop offset="50%" stop-color="#fbbf24" />
                      <stop offset="55%" stop-color="#f59e0b" />
                      <stop offset="75%" stop-color="#d97706" />
                      <stop offset="100%" stop-color="#991b1b" />
                    </linearGradient>
                    <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stop-color="rgba(245,158,11,0.15)" />
                      <stop offset="100%" stop-color="transparent" />
                    </radialGradient>
                  </defs>

                  <g transform="translate(150,155)">
                    <path
                      d="M -140,0 A 140,140 0 0,1 140,0"
                      fill="none"
                      stroke="url(#gaugeGrad)"
                      strokeWidth="12"
                      strokeLinecap="round"
                      opacity="0.3"
                    />
                    <path
                      d="M -130,0 A 130,130 0 0,1 130,0"
                      fill="none"
                      stroke="url(#gaugeGrad)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      opacity="0.6"
                    />

                    {[-40, -30, -20, -10, 0, 10, 20, 30, 40].map((c) => {
                      const a = (c / 50) * 120;
                      const rad = (a * Math.PI) / 180;
                      const r1 = 122;
                      const r2 = c === 0 ? 130 : 126;
                      const x1 = Math.sin(rad) * r1;
                      const y1 = -Math.cos(rad) * r1;
                      const x2 = Math.sin(rad) * r2;
                      const y2 = -Math.cos(rad) * r2;
                      return (
                        <line
                          key={c}
                          x1={x1} y1={y1}
                          x2={x2} y2={y2}
                          stroke="rgba(217,119,6,0.4)"
                          strokeWidth={c === 0 ? 2 : 1}
                        />
                      );
                    })}

                    <text x="0" y="-140" textAnchor="middle" fill="rgba(212,165,116,0.4)" fontSize="8" fontFamily="monospace">
                      -50¢
                    </text>
                    <text x="140" y="-140" textAnchor="middle" fill="rgba(212,165,116,0.4)" fontSize="8" fontFamily="monospace">
                      +50¢
                    </text>

                    <circle cx="0" cy="0" r="60" fill="url(#centerGlow)" />

                    <text
                      x="0" y="-8"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={inTune ? "#f59e0b" : "#fef3c7"}
                      fontFamily="Playfair Display, Georgia, serif"
                      fontSize="42"
                      fontWeight="700"
                      className="select-none"
                    >
                      {note}
                    </text>
                    {note !== "—" && (
                      <text
                        x="35" y="16"
                        textAnchor="start"
                        fill="rgba(212,165,116,0.6)"
                        fontFamily="JetBrains Mono, monospace"
                        fontSize="12"
                        className="select-none"
                      >
                        {octave}
                      </text>
                    )}

                    {note !== "—" && (
                      <text
                        x="0" y="22"
                        textAnchor="middle"
                        fill={inTune ? "#f59e0b" : "rgba(212,165,116,0.5)"}
                        fontFamily="JetBrains Mono, monospace"
                        fontSize="13"
                        fontWeight={inTune ? "700" : "400"}
                        className="select-none"
                      >
                        {cents > 0 ? "+" : ""}{cents}¢
                      </text>
                    )}

                    <g transform={`rotate(${angle})`}>
                      <line
                        x1="0" y1="12"
                        x2="0" y2="-118"
                        stroke={needleColor}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <circle cx="0" cy="0" r="5" fill={needleColor} />
                      <circle cx="0" cy="0" r="2" fill="#1a0f08" />
                    </g>
                  </g>
                </svg>
              </div>

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

              {freq > 0 && (
                <p className="font-mono text-xs tracking-wide text-text-muted">
                  {freq} Hz
                </p>
              )}

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
