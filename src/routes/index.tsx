import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  autoCorrelate,
  freqToPitchClass,
  matchKignit,
  PITCH_NAMES,
  scaleNotes,
  scaleIntervals,
  type KignitMatch,
} from "@/lib/pitch";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ቅኝት Finder — Ethiopian Kirar & Begena Kignit Detector" },
      {
        name: "description",
        content:
          "Detect the ቅኝት (kignit) of Ethiopian kirar and begena mezmurs — Tizita, Bati, Ambassel, Anchihoye — by listening or uploading audio.",
      },
      { property: "og:title", content: "ቅኝት Finder — Ethiopian Kignit Detector" },
      {
        property: "og:description",
        content:
          "Identify the Ethiopian modal scale of any kirar or begena mezmur in seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Status = "idle" | "recording" | "cropping" | "analyzing" | "done" | "error";

const MAX_SEGMENT_SECONDS = 60;

function yieldToMainThread(): Promise<void> {
  return new Promise((r) => setTimeout(r, 16));
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  data: Float32Array,
  sampleRate: number,
  startPct: number,
  endPct: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const totalSamples = data.length;
  const pixelsPerSample = totalSamples / w;
  const peaks = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const start = Math.floor(x * pixelsPerSample);
    const end = Math.floor((x + 1) * pixelsPerSample);
    let peak = 0;
    for (let i = start; i < end && i < totalSamples; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
    peaks[x] = peak;
  }

  const mid = h / 2;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const barH = peaks[x] * (h * 0.9);
    ctx.moveTo(x, mid - barH);
    ctx.lineTo(x, mid + barH);
  }
  ctx.strokeStyle = "rgba(251, 191, 36, 0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const sx = (startPct / 100) * w;
  const ex = (endPct / 100) * w;
  ctx.fillStyle = "rgba(251, 191, 36, 0.12)";
  ctx.fillRect(sx, 0, ex - sx, h);

  ctx.fillStyle = "rgba(251, 191, 36, 0.5)";
  ctx.fillRect(sx, 0, 2, h);
  ctx.fillRect(ex - 2, 0, 2, h);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Index() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [histogram, setHistogram] = useState<number[]>(new Array(12).fill(0));
  const [matches, setMatches] = useState<KignitMatch[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);

  const [segmentStart, setSegmentStart] = useState(0);
  const [segmentEnd, setSegmentEnd] = useState(100);
  const [fileName, setFileName] = useState("");
  const [fileDuration, setFileDuration] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const histRef = useRef<number[]>(new Array(12).fill(0));
  const startTimeRef = useRef<number>(0);
  const audioDataRef = useRef<Float32Array | null>(null);
  const sampleRateRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => () => cleanup(), []);

  useEffect(() => {
    const data = audioDataRef.current;
    if (status === "cropping" && data && canvasRef.current) {
      drawWaveform(canvasRef.current, data, sampleRateRef.current, segmentStart, segmentEnd);
    }
  }, [status, segmentStart, segmentEnd]);

  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current = null;
    rafRef.current = null;
  }

  async function start() {
    setError(null);
    setMatches([]);
    histRef.current = new Array(12).fill(0);
    setHistogram([...histRef.current]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AC =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      setStatus("recording");
      startTimeRef.current = performance.now();

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const freq = autoCorrelate(buf, ctx.sampleRate);
        if (freq > 60 && freq < 1500) {
          const pc = freqToPitchClass(freq);
          histRef.current[pc] += 1;
          setHistogram([...histRef.current]);
        }
        setElapsed((performance.now() - startTimeRef.current) / 1000);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone access failed");
      setStatus("error");
    }
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    setStatus("analyzing");
    const results = matchKignit(histRef.current);
    setMatches(results.slice(0, 5));
    setStatus("done");
  }

  async function loadFile(file: File) {
    setError(null);
    setMatches([]);
    setFileName(file.name);
    try {
      const AC =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const arrayBuf = await file.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      ctx.close().catch(() => {});

      const data = audioBuf.getChannelData(0);
      const sr = audioBuf.sampleRate;
      const duration = data.length / sr;
      audioDataRef.current = data;
      sampleRateRef.current = sr;
      setFileDuration(duration);

      const initialEnd = Math.min(100, (MAX_SEGMENT_SECONDS / duration) * 100);
      setSegmentStart(0);
      setSegmentEnd(initialEnd);
      setSelectedDuration(Math.min(duration, MAX_SEGMENT_SECONDS));
      setStatus("cropping");

      requestAnimationFrame(() => {
        if (canvasRef.current) {
          drawWaveform(canvasRef.current, data, sr, 0, initialEnd);
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not decode audio");
      setStatus("error");
    }
  }

  function handleStartChange(value: number) {
    const maxEnd = Math.min(100, value + (MAX_SEGMENT_SECONDS / fileDuration) * 100);
    const newEnd = Math.min(segmentEnd, maxEnd);
    const newStart = Math.min(value, newEnd - 0.5);
    setSegmentStart(newStart);
    setSegmentEnd(newEnd);
    setSelectedDuration(((newEnd - newStart) / 100) * fileDuration);
  }

  function handleEndChange(value: number) {
    const minStart = Math.max(0, value - (MAX_SEGMENT_SECONDS / fileDuration) * 100);
    const newStart = Math.max(segmentStart, minStart);
    const newEnd = Math.max(value, newStart + 0.5);
    setSegmentStart(newStart);
    setSegmentEnd(newEnd);
    setSelectedDuration(((newEnd - newStart) / 100) * fileDuration);
  }

  function resetCrop() {
    const initialEnd = Math.min(100, (MAX_SEGMENT_SECONDS / fileDuration) * 100);
    setSegmentStart(0);
    setSegmentEnd(initialEnd);
    setSelectedDuration(Math.min(fileDuration, MAX_SEGMENT_SECONDS));
  }

  async function analyzeSegment() {
    const data = audioDataRef.current;
    if (!data) return;

    setError(null);
    setMatches([]);
    histRef.current = new Array(12).fill(0);
    setProgress(0);
    setStatus("analyzing");

    const sr = sampleRateRef.current;
    const totalSamples = data.length;
    const startSample = Math.floor((segmentStart / 100) * totalSamples);
    const endSample = Math.floor((segmentEnd / 100) * totalSamples);
    const segmentData = data.slice(startSample, endSample);

    const windowSize = 2048;
    const hop = 1024;
    const totalWindows = Math.floor((segmentData.length - windowSize) / hop);
    let lastYield = performance.now();

    for (let i = 0; i + windowSize < segmentData.length; i += hop) {
      const slice = segmentData.slice(i, i + windowSize);
      const freq = autoCorrelate(slice, sr);
      if (freq > 60 && freq < 1500) {
        const pc = freqToPitchClass(freq);
        histRef.current[pc] += 1;
      }
      const windowIndex = Math.floor(i / hop);
      if (performance.now() - lastYield > 100) {
        setProgress(Math.round((windowIndex / totalWindows) * 100));
        await yieldToMainThread();
        lastYield = performance.now();
      }
    }

    setHistogram([...histRef.current]);
    const results = matchKignit(histRef.current);
    setMatches(results.slice(0, 5));
    setStatus("done");
  }

  function backToCrop() {
    setStatus("cropping");
  }

  const maxHist = Math.max(1, ...histogram);
  const totalNotes = histogram.reduce((s, v) => s + v, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0f08] via-[#2a1810] to-[#1a0f08] text-amber-50">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="mb-10 text-center">
          <div className="mb-3 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs uppercase tracking-widest text-amber-300">
            ክራር · በገና · ቅኝት
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            ቅኝት <span className="text-amber-400">Finder</span>
          </h1>
          <p className="mt-3 text-sm text-amber-200/70 sm:text-base">
            Play or upload a mezmur — we'll detect the Ethiopian kignit
            (Tizita, Bati, Ambassel, Anchihoye) from its melody.
          </p>
        </header>

        <section className="rounded-2xl border border-amber-500/20 bg-black/30 p-5 backdrop-blur sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row">
            {status !== "recording" ? (
              <button
                onClick={start}
                disabled={status === "analyzing"}
                className="flex-1 rounded-xl bg-amber-500 px-5 py-4 font-semibold text-[#1a0f08] shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 disabled:opacity-50"
              >
                🎤 Listen to Mezmur
              </button>
            ) : (
              <button
                onClick={stop}
                className="flex-1 animate-pulse rounded-xl bg-red-500 px-5 py-4 font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-400"
              >
                ⏹ Stop & Analyze ({elapsed.toFixed(1)}s)
              </button>
            )}

            {status !== "cropping" && (
              <label className="flex-1 cursor-pointer rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 text-center font-semibold text-amber-200 transition hover:bg-amber-500/10">
                📁 Upload Audio
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) loadFile(f);
                  }}
                />
              </label>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {status === "analyzing" && progress > 0 && (
            <div className="mt-6">
              <div className="mb-1 flex items-center justify-between text-xs text-amber-200/60">
                <span>Analyzing audio…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-amber-500/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {status === "cropping" && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-xs text-amber-200/60">
                <span className="truncate">{fileName}</span>
                <span>{formatTime(fileDuration)} total</span>
              </div>

              <canvas
                ref={canvasRef}
                className="w-full rounded-lg"
                height={140}
                style={{ imageRendering: "crisp-edges" }}
              />

              <div className="mt-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs text-amber-200/60">
                    <span>Segment start</span>
                    <span>{formatTime((segmentStart / 100) * fileDuration)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.1}
                    value={segmentStart}
                    onChange={(e) => handleStartChange(Number(e.target.value))}
                    className="mt-1 w-full accent-amber-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-amber-200/60">
                    <span>Segment end</span>
                    <span>{formatTime((segmentEnd / 100) * fileDuration)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.1}
                    value={segmentEnd}
                    onChange={(e) => handleEndChange(Number(e.target.value))}
                    className="mt-1 w-full accent-amber-500"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-amber-500/5 px-3 py-2 text-xs text-amber-200/70">
                <span>Selected: {formatTime(selectedDuration)}</span>
                <span>Max segment: {MAX_SEGMENT_SECONDS}s</span>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={resetCrop}
                  className="flex-1 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/10"
                >
                  Reset
                </button>
                <button
                  onClick={analyzeSegment}
                  className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-[#1a0f08] shadow-lg shadow-amber-500/20 transition hover:bg-amber-400"
                >
                  🔍 Analyze This Segment
                </button>
              </div>
            </div>
          )}

          {totalNotes > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs uppercase tracking-wider text-amber-300/70">
                Pitch distribution · {totalNotes} notes detected
              </p>
              <div className="flex h-32 items-end gap-1">
                {histogram.map((v, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-amber-600 to-amber-300 transition-all"
                      style={{ height: `${(v / maxHist) * 100}%`, minHeight: v > 0 ? 2 : 0 }}
                    />
                    <span className="text-[10px] text-amber-200/60">{PITCH_NAMES[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {matches.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-amber-300">
                Detected Kignit
              </h2>
              <button
                onClick={backToCrop}
                className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/10"
              >
                ← Adjust segment
              </button>
            </div>
            <div className="space-y-3">
              {matches.map((m, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-4 transition ${
                    idx === 0
                      ? "border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10"
                      : "border-amber-500/15 bg-black/20"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-lg font-semibold text-amber-100">
                          {m.kignit.name}
                        </span>
                        <span className="text-amber-300">{m.kignit.amharic}</span>
                        <span className="text-sm text-amber-200/60">
                          · tonic {PITCH_NAMES[m.tonic]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-amber-200/70">
                        {m.kignit.description}
                      </p>
                      <div className="mt-3">
                        <div className="text-[10px] uppercase tracking-wider text-amber-300/60">
                          Scale · {scaleIntervals(m.kignit).join("-")} semitones
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {scaleNotes(m.kignit, m.tonic).map((n, i) => (
                            <span
                              key={i}
                              className={`rounded-md px-2 py-0.5 text-xs font-mono ${
                                i === 0
                                  ? "bg-amber-400 text-[#1a0f08]"
                                  : "border border-amber-500/30 bg-amber-500/5 text-amber-100"
                              }`}
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-2xl font-bold text-amber-300">
                        {(m.score * 100).toFixed(0)}%
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-amber-200/50">
                        match
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
