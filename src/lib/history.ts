import { type KignitMatch } from "./pitch";

const STORAGE_KEY = "kignit-history";
const MAX_ENTRIES = 50;

export interface HistoryEntry {
  id: string;
  timestamp: number;
  method: "mic" | "file";
  fileName?: string;
  name?: string;
  duration?: number;
  matches: KignitMatch[];
  histogram: number[];
  totalNotes: number;
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function saveEntry(entry: Omit<HistoryEntry, "id" | "timestamp">): void {
  const history = loadHistory();
  history.unshift({
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    ...entry,
  });
  if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function deleteEntry(id: string): void {
  const history = loadHistory().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}
