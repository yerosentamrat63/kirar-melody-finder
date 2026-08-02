import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { KIGNITS, scaleNotes, scaleIntervals, PITCH_NAMES } from "@/lib/pitch";

export const Route = createFileRoute("/kignits")({
  head: () => ({
    meta: [
      { title: "ቅኝቶች — Ethiopian Kignit Reference" },
      {
        name: "description",
        content:
          "Reference guide for Ethiopian kignits: Tizita, Bati, Ambassel, Anchihoye — scales, intervals, and descriptions.",
      },
    ],
  }),
  component: KignitsPage,
});

function KignitsPage() {
  const [tonic, setTonic] = useState(0);

  return (
    <div className="parchment-bg min-h-screen pb-20 font-sans text-text-primary">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald-500/60">
            <span className="inline-block h-px w-6 bg-emerald-500/30" />
            ቅኝት
            <span className="inline-block h-px w-6 bg-emerald-500/30" />
          </div>
          <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
            ቅኝቶች{" "}
            <span className="text-gradient-gold">Reference</span>
          </h1>
          <p className="mt-3 font-sans text-sm text-text-secondary sm:text-base">
            The six Ethiopian modal scales (ቅኝት / kignit) used in kirar and begena music.
          </p>
        </header>

        <section className="manuscript-card rounded-xl p-5 sm:p-7">
          <div className="mb-6">
            <p className="mb-3 text-center font-sans text-[10px] uppercase tracking-[0.15em] text-emerald-500/50">
              Choose a tonic to see scales
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {PITCH_NAMES.map((name, i) => (
                <button
                  key={i}
                  onClick={() => setTonic(i)}
                  className={`font-mono rounded-md px-3 py-1.5 text-sm transition-all duration-200 ${
                    i === tonic
                      ? "bg-emerald-500 text-ink shadow-sm shadow-emerald-500/30"
                      : "border border-emerald-500/20 text-text-secondary hover:border-emerald-500/40 hover:text-text-primary"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <ul className="space-y-5">
            {KIGNITS.map((k) => {
              const intervals = scaleIntervals(k);
              const notes = scaleNotes(k, tonic);

              return (
                <li key={k.name} className="manuscript-card manuscript-card-hover rounded-lg p-4">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="font-serif text-lg font-semibold text-text-primary">{k.name}</span>
                    <span className="font-mono text-sm tracking-wide text-emerald-500">{k.amharic}</span>
                  </div>
                  <p className="mt-1.5 font-sans text-sm leading-relaxed text-text-secondary">{k.description}</p>
                  <div className="mt-3">
                    <p className="font-sans text-[10px] uppercase tracking-[0.12em] text-emerald-500/50">
                      Scale &middot; {intervals.join(" – ")} semitones
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {notes.map((n, i) => (
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
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {PITCH_NAMES.map((n, i) => (
                        <span
                          key={i}
                          className={`inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-mono ${
                            k.profile[(i - tonic + 12) % 12] > 0
                              ? "bg-emerald-500/20 text-text-primary"
                              : "text-text-muted"
                          }`}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-5 text-xs font-sans tracking-wide text-text-muted">
            Best results with a clear kirar or begena melody, minimal background noise, and 10–30 seconds of playback.
          </p>
        </section>
      </div>
    </div>
  );
}
