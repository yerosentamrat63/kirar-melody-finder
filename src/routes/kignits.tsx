import { createFileRoute } from "@tanstack/react-router";
import { KIGNITS, scaleNotes, scaleIntervals } from "@/lib/pitch";

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
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0f08] via-[#2a1810] to-[#1a0f08] text-amber-50">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-16">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            ቅኝቶች <span className="text-amber-400">Reference</span>
          </h1>
          <p className="mt-3 text-sm text-amber-200/70 sm:text-base">
            The six Ethiopian modal scales (ቅኝት / kignit) used in kirar and begena music.
          </p>
        </header>

        <section className="rounded-2xl border border-amber-500/20 bg-black/30 p-5 backdrop-blur sm:p-7">
          <ul className="space-y-5">
            {KIGNITS.map((k) => {
              const intervals = scaleIntervals(k);
              const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

              return (
                <li key={k.name} className="rounded-xl border border-amber-500/15 bg-black/20 p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-lg font-semibold text-amber-100">{k.name}</span>
                    <span className="text-amber-300">{k.amharic}</span>
                  </div>
                  <p className="mt-1 text-sm text-amber-200/70">{k.description}</p>
                  <div className="mt-3">
                    <div className="text-[10px] uppercase tracking-wider text-amber-300/60">
                      Scale pattern · {intervals.join(" – ")} semitones
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {scaleNotes(k, 0).map((n, i) => (
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
                    <div className="mt-2 flex flex-wrap gap-1">
                      {noteNames.map((n, i) => (
                        <span
                          key={i}
                          className={`inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-mono ${
                            k.profile[i] > 0
                              ? "bg-amber-500/20 text-amber-200"
                              : "text-amber-200/20"
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
          <p className="mt-5 text-xs text-amber-200/50">
            Best results with a clear kirar or begena melody, minimal background noise, and 10–30 seconds of playback.
          </p>
        </section>
      </div>
    </div>
  );
}
