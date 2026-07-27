// Pitch detection (autocorrelation) + pitch-class histogram + Kignit matcher.

export function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

  const trimmed = buf.slice(r1, r2);
  const size = trimmed.length;
  const c = new Array(size).fill(0);
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size - i; j++) c[i] += trimmed[j] * trimmed[j + i];

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < size; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  let T0 = maxpos;
  if (T0 <= 0) return -1;
  const x1 = c[T0 - 1] ?? 0, x2 = c[T0] ?? 0, x3 = c[T0 + 1] ?? 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);
  return sampleRate / T0;
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
