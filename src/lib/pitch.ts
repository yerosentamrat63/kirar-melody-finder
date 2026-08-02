// Pitch detection (YIN) + pitch-class histogram + Kignit matcher.

// YIN algorithm — robust monophonic pitch detection (de Cheveigné & Kawahara).
// Returns the detected frequency and a "clarity" value (0 = periodic/clean,
// 1 = no clear period). Returns null when the frame is silence or noise.
export function yinDetect(
  buf: Float32Array,
  sampleRate: number,
  minFreq = 40,
  threshold = 0.1
): { freq: number; clarity: number } | null {
  const SIZE = buf.length;
  let maxLag = Math.min(SIZE - 2, Math.floor(sampleRate / minFreq));
  if (maxLag < 2) return null;
  // Keep at least one full period inside the window for reliable detection.
  maxLag = Math.min(maxLag, Math.floor(SIZE / 2));
  if (maxLag < 2) return null;

  const windowLen = SIZE - maxLag;
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    for (let i = 0; i < windowLen; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum / windowLen;
  }

  // Cumulative mean normalized difference
  const dNorm = new Float32Array(maxLag + 1);
  dNorm[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    runningSum += d[tau];
    dNorm[tau] = runningSum === 0 ? 1 : (d[tau] * tau) / runningSum;
  }

  // Absolute threshold, stepping down to the local minimum
  let tau = -1;
  for (let t = 2; t <= maxLag; t++) {
    if (dNorm[t] < threshold) {
      while (t + 1 <= maxLag && dNorm[t + 1] < dNorm[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return null;
  const clarity = dNorm[tau];

  // Parabolic interpolation for sub-sample precision
  let betterTau = tau;
  const x0 = dNorm[tau - 1];
  const x1 = dNorm[tau];
  const x2 = dNorm[tau + 1];
  const denom = x0 - 2 * x1 + x2;
  if (denom !== 0) {
    const delta = 0.5 * (x0 - x2) / denom;
    if (Math.abs(delta) < 1) betterTau = tau + delta;
  }

  return { freq: sampleRate / betterTau, clarity };
}

// Backwards-compatible wrapper for callers that only need the frequency.
export function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  const result = yinDetect(buf, sampleRate);
  return result ? result.freq : -1;
}

export function freqToPitchClass(freq: number): number {
  const noteNum = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
  return ((Math.round(noteNum) % 12) + 12) % 12;
}

// Kignit templates: weighted pitch-class profile relative to tonic (index 0)
// Weights emphasize scale degrees; approximations based on common tuning.
export interface KignitTemplate {
  name: string;
  amharic: string;
  description: string;
  profile: number[]; // length 12, relative to tonic
}

const T = (arr: number[]): number[] => {
  const p = new Array(12).fill(0);
  arr.forEach((v, i) => (p[i] = v));
  return p;
};

// Values loosely inspired by Ethiopian pentatonic modes (Tizita, Bati, Ambassel, Anchihoye)
// Index = semitones from tonic. Higher weight = more characteristic.
export const KIGNITS: KignitTemplate[] = [
  {
    name: "Tizita (Major)",
    amharic: "ትዝታ",
    description: "Nostalgic, sweet pentatonic mode. Common in love songs and mezmurs.",
    // 0, 2, 4, 7, 9  (major pentatonic-like)
    profile: T([5, 0, 3, 0, 4, 0, 0, 4, 0, 3, 0, 0]),
  },
  {
    name: "Tizita (Minor)",
    amharic: "ትዝታ (ደቂቅ)",
    description: "Melancholic variant of Tizita.",
    // 0, 3, 5, 7, 10
    profile: T([5, 0, 0, 3, 0, 3, 0, 4, 0, 0, 3, 0]),
  },
  {
    name: "Bati (Major)",
    amharic: "ባቲ",
    description: "Bright, festive mode used across Amhara and Oromo music.",
    // 0, 2, 5, 7, 9
    profile: T([5, 0, 3, 0, 0, 3, 0, 4, 0, 3, 0, 0]),
  },
  {
    name: "Bati (Minor)",
    amharic: "ባቲ (ደቂቅ)",
    description: "Somber Bati variant.",
    // 0, 3, 5, 7, 10
    profile: T([5, 0, 0, 3, 0, 3, 0, 4, 0, 0, 3, 0]),
  },
  {
    name: "Ambassel",
    amharic: "አምባሰል",
    description: "Reflective, prayerful mode — very common in mezmurs and begena music.",
    // 0, 1, 5, 7, 8
    profile: T([5, 3, 0, 0, 0, 3, 0, 4, 3, 0, 0, 0]),
  },
  {
    name: "Anchihoye",
    amharic: "አንቺሆዬ",
    description: "Playful, spirited mode found in Ethiopian folk and church music.",
    // 0, 1, 5, 6, 8  (approximate)
    profile: T([5, 3, 0, 0, 0, 3, 3, 0, 3, 0, 0, 0]),
  },
];

export const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export interface KignitMatch {
  kignit: KignitTemplate;
  tonic: number; // 0..11
  score: number; // correlation
}

// Normalize + Pearson correlation between two 12-vectors
function correlate(a: number[], b: number[]): number {
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) {
    const va = a[i] - ma, vb = b[i] - mb;
    num += va * vb; da += va * va; db += vb * vb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

function rotate(arr: number[], n: number): number[] {
  return arr.map((_, i) => arr[(i - n + 12 + 12) % 12]);
}

export function matchKignit(histogram: number[]): KignitMatch[] {
  const results: KignitMatch[] = [];
  for (const k of KIGNITS) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const rotated = rotate(k.profile, tonic);
      const score = correlate(histogram, rotated);
      results.push({ kignit: k, tonic, score });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

// Scale degree offsets (semitones from tonic) present in the template.
export function scaleDegrees(template: KignitTemplate): number[] {
  const degrees: number[] = [];
  for (let i = 0; i < 12; i++) if (template.profile[i] > 0) degrees.push(i);
  return degrees;
}

// Note names for the scale, starting on `tonic` and wrapping to tonic+octave.
export function scaleNotes(template: KignitTemplate, tonic: number): string[] {
  const degs = scaleDegrees(template);
  const notes = degs.map((d) => PITCH_NAMES[(tonic + d) % 12]);
  notes.push(PITCH_NAMES[tonic] + "′"); // octave
  return notes;
}

// Interval pattern in semitones between successive scale notes (incl. octave return).
export function scaleIntervals(template: KignitTemplate): number[] {
  const degs = [...scaleDegrees(template), 12];
  const ints: number[] = [];
  for (let i = 1; i < degs.length; i++) ints.push(degs[i] - degs[i - 1]);
  return ints;
}
