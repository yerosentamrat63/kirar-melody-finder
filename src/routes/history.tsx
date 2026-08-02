import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadHistory, clearHistory, deleteEntry, type HistoryEntry } from "@/lib/history";
import { PITCH_NAMES } from "@/lib/pitch";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — ቅኝት Finder" },
      {
        name: "description",
        content: "Past kignit detection results.",
      },
    ],
  }),
  component: HistoryPage,
});

function formatDate(ts: number): string {
  const d = new Date(ts);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const hour = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${month} ${day}, ${hour}:${min}`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  function handleClear() {
    clearHistory();
    setHistory([]);
  }

  function handleDelete(id: string) {
    deleteEntry(id);
    setHistory(loadHistory());
    if (expanded === id) setExpanded(null);
  }

  return (
    <div className="parchment-bg min-h-screen pb-20 font-sans text-text-primary">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-500/60">
            <span className="inline-block h-px w-6 bg-amber-500/30" />
            history
            <span className="inline-block h-px w-6 bg-amber-500/30" />
          </div>
          <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
            Detection{" "}
            <span className="text-gradient-gold">History</span>
          </h1>
          <p className="mt-3 font-sans text-sm text-text-secondary sm:text-base">
            Past kignit analyses, ordered newest first.
          </p>
        </header>

        {history.length === 0 ? (
          <section className="manuscript-card rounded-xl p-10 text-center">
            <p className="text-sm text-text-muted">No analyses yet.</p>
            <p className="mt-1 text-xs text-text-muted">
              Detect a kignit first — results appear here automatically.
            </p>
            <Link
              to="/"
              className="btn-gold mt-4 inline-block rounded-lg px-5 py-2.5 text-sm"
            >
              Go to Detector
            </Link>
          </section>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between">
              <p className="text-xs tracking-wide text-text-muted">
                {history.length} {history.length === 1 ? "entry" : "entries"}
              </p>
              <button
                onClick={handleClear}
                className="btn-outline rounded-lg px-3 py-1.5 text-[11px]"
              >
                Clear all
              </button>
            </div>

            <div className="space-y-3">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="manuscript-card manuscript-card-hover rounded-lg"
                >
                  <button
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="flex min-w-0 flex-col items-start gap-0.5">
                      {entry.name ? (
                        <span className="truncate font-serif text-lg font-semibold text-text-primary">
                          {entry.name}
                        </span>
                      ) : null}
                      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span
                          className={`shrink-0 font-serif font-semibold ${
                            entry.name ? "text-base text-amber-400" : "text-lg"
                          }`}
                        >
                          {entry.matches[0]?.kignit.name ?? "—"}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-amber-500/60">
                          {entry.matches[0]?.kignit.amharic ?? ""}
                        </span>
                        <span className="hidden shrink-0 text-xs text-text-muted sm:inline">
                          {entry.method === "mic" ? "mic" : entry.fileName ?? "file"}
                        </span>
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-xs text-text-muted">
                        {formatDate(entry.timestamp)}
                      </span>
                      <span className="text-xs text-text-muted">
                        {expanded === entry.id ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>

                  {expanded === entry.id && (
                    <div className="border-t border-amber-500/10 px-4 py-4">
                      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                        <span>Method: {entry.method === "mic" ? "Microphone" : "File upload"}</span>
                        {entry.name && <span>Name: {entry.name}</span>}
                        {entry.fileName && <span>File: {entry.fileName}</span>}
                        {entry.duration && <span>Duration: {formatDuration(entry.duration)}</span>}
                        <span>Notes detected: {entry.totalNotes}</span>
                      </div>

                      <div className="space-y-2">
                        {entry.matches.map((m, idx) => (
                          <div
                            key={idx}
                            className={`rounded-lg border p-3 ${
                              idx === 0
                                ? "border-amber-500/30 bg-amber-500/8"
                                : "border-amber-500/10"
                            }`}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <div className="min-w-0">
                                <span className="font-serif text-sm font-semibold text-text-primary">
                                  {m.kignit.name}
                                </span>
                                <span className="ml-2 font-mono text-xs text-amber-500/70">
                                  {m.kignit.amharic}
                                </span>
                                <span className="ml-2 text-xs text-text-muted">
                                  tonic {PITCH_NAMES[m.tonic]}
                                </span>
                              </div>
                              <span className="shrink-0 font-serif text-lg font-bold text-amber-400">
                                {(m.score * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="rounded px-2 py-1 text-[11px] text-red-400/60 transition hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
