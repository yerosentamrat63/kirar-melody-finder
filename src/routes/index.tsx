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
import { RangeSlider } from "@/components/RangeSlider";
import { saveEntry, type HistoryEntry } from "@/lib/history";

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

type Status = "idle" | "recording" | "loading" | "cropping" | "analyzing" | "done" | "error";

const MAX_SEGMENT_SECONDS = 120;

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
  ctx.strokeStyle = "rgba(52, 211, 153, 0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const sx = (startPct / 100) * w;
  const ex = (endPct / 100) * w;
  ctx.fillStyle = "rgba(52, 211, 153, 0.12)";
  ctx.fillRect(sx, 0, ex - sx, h);

  ctx.fillStyle = "rgba(52, 211, 153, 0.5)";
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

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeInfo, setYoutubeInfo] = useState<{
    id: string;
    title: string;
    author: string;
    duration: number;
  } | null>(null);
  const [youtubeBusy, setYoutubeBusy] = useState(false);
  const [youtubeProgress, setYoutubeProgress] = useState(0);

  const [pendingEntry, setPendingEntry] = useState<
    Omit<HistoryEntry, "id" | "timestamp" | "name"> | null
  >(null);
  const [entryName, setEntryName] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const histRef = useRef<number[]>(new Array(12).fill(0));
  const startTimeRef = useRef<number>(0);
  const audioDataRef = useRef<Float32Array | null>(null);
  const sampleRateRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<"file" | "youtube">("file");

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
    setPendingEntry(null);
    setSavedFlash(false);
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
    setPendingEntry({
      method: "mic",
      duration: elapsed,
      matches: results.slice(0, 5),
      histogram: [...histRef.current],
      totalNotes: histRef.current.reduce((s, v) => s + v, 0),
    });
    setEntryName("");
    setSavedFlash(false);
  }

  async function loadFile(file: File) {
    setError(null);
    setMatches([]);
    setPendingEntry(null);
    setSavedFlash(false);
    setFileName(file.name);
    sourceRef.current = "file";
    setStatus("loading");
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

  async function handleFetchYoutube() {
    const url = youtubeUrl.trim();
    if (!url || youtubeBusy) return;
    setError(null);
    setYoutubeInfo(null);
    setYoutubeBusy(true);
    try {
      const res = await fetch(`/api/youtube/info?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Could not fetch the YouTube video.");
      }
      setYoutubeInfo({
        id: data.id,
        title: data.title,
        author: data.author,
        duration: data.duration,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch the YouTube video.");
    } finally {
      setYoutubeBusy(false);
    }
  }

  async function fetchYoutubeStream(videoId: string): Promise<ArrayBuffer> {
    const res = await fetch(`/api/youtube/stream?v=${encodeURIComponent(videoId)}`);
    if (!res.ok) {
      let msg = `Could not load the audio (HTTP ${res.status}).`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const total = Number(res.headers.get("content-length") ?? 0);
    if (!res.body) return res.arrayBuffer();
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        if (total > 0) setYoutubeProgress(Math.round((received / total) * 100));
      }
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    return merged.buffer as ArrayBuffer;
  }

  async function loadYoutubeAudio() {
    if (!youtubeInfo || status === "loading") return;
    setError(null);
    setMatches([]);
    setPendingEntry(null);
    setSavedFlash(false);
    setStatus("loading");
    setYoutubeProgress(0);
    try {
      const arrayBuf = await fetchYoutubeStream(youtubeInfo.id);
      const AC =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      ctx.close().catch(() => {});

      const data = audioBuf.getChannelData(0);
      const sr = audioBuf.sampleRate;
      const duration = data.length / sr;
      audioDataRef.current = data;
      sampleRateRef.current = sr;
      setFileDuration(duration);
      setFileName(youtubeInfo.title || "YouTube mezmur");
      sourceRef.current = "youtube";

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
      setError(e instanceof Error ? e.message : "Could not load YouTube audio");
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

  function downsample(data: Float32Array, fromRate: number, toRate: number): Float32Array {
    const ratio = fromRate / toRate;
    const len = Math.floor(data.length / ratio);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(Math.floor((i + 1) * ratio), data.length);
      let sum = 0;
      for (let j = start; j < end; j++) sum += data[j];
      out[i] = sum / (end - start);
    }
    return out;
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
    const segmentData = downsample(data.slice(startSample, endSample), sr, 4000);
    const analysisSr = 4000;

    const windowSize = 1024;
    const hop = 256;
    const totalWindows = Math.floor((segmentData.length - windowSize) / hop);
    let lastYield = performance.now();

    for (let i = 0; i + windowSize < segmentData.length; i += hop) {
      const slice = segmentData.slice(i, i + windowSize);
      const freq = autoCorrelate(slice, analysisSr);
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
    setPendingEntry({
      method: sourceRef.current,
      fileName,
      duration: selectedDuration,
      matches: results.slice(0, 5),
      histogram: [...histRef.current],
      totalNotes: histRef.current.reduce((s, v) => s + v, 0),
    });
    setEntryName("");
    setSavedFlash(false);
  }

  function handleSaveEntry() {
    if (!pendingEntry) return;
    saveEntry({
      ...pendingEntry,
      name: entryName.trim() || undefined,
    });
    setPendingEntry(null);
    setEntryName("");
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 3000);
  }

  function backToCrop() {
    setStatus("cropping");
  }

  const maxHist = Math.max(1, ...histogram);
  const totalNotes = histogram.reduce((s, v) => s + v, 0);

  return (
    <div className="parchment-bg min-h-screen pb-20 font-sans text-text-primary">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald-500/60">
            <span className="inline-block h-px w-6 bg-emerald-500/30" />
            ክራር · በገና · ቅኝት
            <span className="inline-block h-px w-6 bg-emerald-500/30" />
          </div>
          <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
            ቅኝት{" "}
            <span className="text-gradient-gold">Finder</span>
          </h1>
          <p className="mt-3 font-sans text-sm text-text-secondary sm:text-base">
            Play or upload a mezmur — we'll detect the Ethiopian kignit
            (Tizita, Bati, Ambassel, Anchihoye) from its melody.
          </p>
        </header>

        <section className="manuscript-card rounded-xl p-5 sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row">
            {status !== "recording" ? (
              <button
                onClick={start}
                disabled={status === "analyzing"}
                className="btn-gold flex-1 rounded-lg px-5 py-4 text-sm tracking-wide"
              >
                Listen to Mezmur
              </button>
            ) : (
              <button
                onClick={stop}
                className="flex-1 animate-pulse rounded-lg bg-red-600 px-5 py-4 text-sm font-semibold tracking-wide text-white shadow-lg shadow-red-600/20 transition hover:bg-red-500 active:scale-[0.97]"
              >
                Stop & Analyze ({elapsed.toFixed(1)}s)
              </button>
            )}

            {status !== "cropping" && status !== "loading" && (
              <label className="btn-outline flex-1 cursor-pointer rounded-lg px-5 py-4 text-center text-sm tracking-wide">
                Upload Audio
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

          {status !== "cropping" && status !== "loading" && status !== "recording" && (
            <div className="mt-4 border-t border-emerald-500/10 pt-4">
              <p className="mb-2 text-[10px] font-sans uppercase tracking-[0.15em] text-emerald-500/50">
                From YouTube
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFetchYoutube();
                  }}
                  placeholder="Paste a YouTube link…"
                  className="min-w-0 flex-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted/60 focus:border-emerald-500/50"
                />
                <button
                  onClick={handleFetchYoutube}
                  disabled={youtubeBusy || !youtubeUrl.trim()}
                  className="btn-outline shrink-0 rounded-lg px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {youtubeBusy ? "Fetching…" : "Fetch Video"}
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
                Max 15 minutes. Private, age-restricted, or region-locked videos may not load.
              </p>

              {youtubeInfo && (
                <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-sm font-medium leading-snug text-text-primary">
                    {youtubeInfo.title}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {youtubeInfo.author || "Unknown channel"} · {formatTime(youtubeInfo.duration)}
                  </p>
                  <button
                    onClick={loadYoutubeAudio}
                    className="btn-gold mt-3 rounded-lg px-4 py-2 text-xs tracking-wide"
                  >
                    Load Mezmur Audio
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {status === "loading" && (
            <div className="mt-6">
              <div className="flex items-center justify-center gap-3 py-6">
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
                <span className="text-sm font-sans tracking-wide text-text-secondary">
                  {youtubeProgress > 0
                    ? `Loading YouTube audio — ${youtubeProgress}%`
                    : "Loading audio…"}
                </span>
              </div>
              {youtubeProgress > 0 && (
                <div className="h-1.5 overflow-hidden rounded-full bg-emerald-500/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-200"
                    style={{ width: `${youtubeProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {status === "analyzing" && progress > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-xs font-sans tracking-wider text-text-muted">
                <span>Analyzing segment</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-emerald-500/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {status === "cropping" && (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between border-b border-emerald-500/10 pb-2 text-xs font-sans tracking-wide text-text-muted">
                <span className="truncate">{fileName}</span>
                <span>{formatTime(fileDuration)} total</span>
              </div>

              <canvas
                ref={canvasRef}
                className="w-full rounded-lg"
                height={140}
                style={{ imageRendering: "crisp-edges" }}
              />

              <div className="mt-4">
                <RangeSlider
                  min={0}
                  max={100}
                  step={0.1}
                  start={segmentStart}
                  end={segmentEnd}
                  maxSeconds={MAX_SEGMENT_SECONDS}
                  onStartChange={handleStartChange}
                  onEndChange={handleEndChange}
                />
              </div>

              <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2 text-xs tracking-wide text-text-secondary">
                <span>Selected: {formatTime(selectedDuration)}</span>
                <span>Max: {MAX_SEGMENT_SECONDS}s</span>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={resetCrop}
                  className="btn-outline flex-1 rounded-lg px-4 py-3 text-sm"
                >
                  Reset
                </button>
                <button
                  onClick={analyzeSegment}
                  className="btn-gold flex-1 rounded-lg px-4 py-3 text-sm"
                >
                  Analyze This Segment
                </button>
              </div>
            </div>
          )}

          {totalNotes > 0 && (
            <div className="mt-7">
              <p className="mb-3 text-[10px] font-sans uppercase tracking-[0.15em] text-emerald-500/50">
                Pitch distribution &middot; {totalNotes} notes
              </p>
              {totalNotes < 600 && (
                <p className="mb-3 text-[11px] leading-relaxed text-emerald-500/60">
                  For a reliable detection aim for <span className="text-emerald-400/80">900–1000+</span> detected tones — record or select a longer segment.
                </p>
              )}
              <div className="flex h-32 items-end gap-[3px]">
                {histogram.map((v, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-emerald-700 to-emerald-400 transition-all duration-300"
                      style={{ height: `${(v / maxHist) * 100}%`, minHeight: v > 0 ? 2 : 0 }}
                    />
                    <span className="font-mono text-[10px] text-text-muted">{PITCH_NAMES[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {matches.length > 0 && (
          <section className="mt-10">
            <div className="mb-5 flex items-center justify-between border-b border-emerald-500/10 pb-3">
              <h2 className="font-serif text-xl font-semibold tracking-tight text-emerald-300">
                Detected Kignit
              </h2>
              <button
                onClick={backToCrop}
                className="btn-outline rounded-lg px-3 py-1.5 text-[11px]"
              >
                ← Adjust segment
              </button>
            </div>

            {pendingEntry ? (
              <div className="mb-4 rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-4">
                <p className="mb-2 text-[10px] font-sans uppercase tracking-[0.15em] text-emerald-500/50">
                  Save to history
                </p>
                {pendingEntry.totalNotes === 0 && (
                  <p className="mb-2 text-[11px] leading-relaxed text-red-400/80">
                    No notes were detected — this capture was likely too short or silent. Consider
                    listening longer before saving.
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={entryName}
                    onChange={(e) => setEntryName(e.target.value)}
                    placeholder={
                      (pendingEntry.method === "file" || pendingEntry.method === "youtube") &&
                      pendingEntry.fileName
                        ? pendingEntry.fileName
                        : "Mezmur name (optional)"
                    }
                    className="min-w-0 flex-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted/60 focus:border-emerald-500/50"
                  />
                  <button
                    onClick={handleSaveEntry}
                    className="btn-gold shrink-0 rounded-lg px-5 py-2.5 text-sm"
                  >
                    Save
                  </button>
                </div>
                {pendingEntry.totalNotes > 0 && pendingEntry.totalNotes < 600 && (
                  <p className="mt-2 text-[11px] text-emerald-500/60">
                    Tip: aim for 900–1000+ detected notes for the most reliable kignit.
                  </p>
                )}
              </div>
            ) : savedFlash ? (
              <p className="mb-4 rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-center text-xs tracking-wide text-emerald-400">
                Saved to history ✓
              </p>
            ) : null}

            <div className="space-y-3">
              {matches.map((m, idx) => (
                <div
                  key={idx}
                  className={`manuscript-card manuscript-card-hover rounded-lg p-4 ${
                    idx === 0 ? "border-emerald-500/40" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <span className="font-serif text-lg font-semibold text-text-primary">
                          {m.kignit.name}
                        </span>
                        <span className="font-mono text-sm tracking-wide text-emerald-500">
                          {m.kignit.amharic}
                        </span>
                        <span className="font-sans text-xs text-text-muted">
                          tonic {PITCH_NAMES[m.tonic]}
                        </span>
                      </div>
                      <p className="mt-1.5 font-sans text-sm leading-relaxed text-text-secondary">
                        {m.kignit.description}
                      </p>
                      <div className="mt-3">
                        <p className="font-sans text-[10px] uppercase tracking-[0.12em] text-emerald-500/50">
                          Scale &middot; {scaleIntervals(m.kignit).join("-")} semitones
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {scaleNotes(m.kignit, m.tonic).map((n, i) => (
                            <span
                              key={i}
                              className={`font-mono rounded-md px-2 py-0.5 text-xs ${
                                i === 0
                                  ? "bg-emerald-500 text-ink"
                                  : "border border-emerald-500/25 text-text-secondary"
                              }`}
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-serif text-2xl font-bold tracking-tight text-emerald-400">
                        {(m.score * 100).toFixed(0)}%
                      </div>
                      <p className="font-sans text-[10px] uppercase tracking-[0.12em] text-text-muted">
                        match
                      </p>
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
