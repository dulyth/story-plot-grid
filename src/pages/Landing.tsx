import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowRight,
  Columns3,
  GripVertical,
  MousePointerClick,
  Rows3,
  ScrollText,
} from "lucide-react";
import { useNavigate } from "react-router";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

const SAMPLE_ROWS = [
  {
    chapter: "Chapter 1",
    cells: [
      "The letter arrives sealed in black wax — nobody in the village can read it but her.",
      "Rain on the orchard; she counts the seconds between lightning and thunder.",
      "",
      "Inheritance as a debt you never agreed to.",
    ],
  },
  {
    chapter: "Chapter 2",
    cells: [
      "",
      "The road out of Harrowmere is longer on the way back.",
      "She lies to the magistrate, and believes herself.",
      "",
    ],
    highlight: true,
  },
  {
    chapter: "Chapter 3",
    cells: [
      "A second letter, this one in her own handwriting.",
      "",
      "What the orchard remembers that she has buried.",
      "Grief wears the mask of duty.",
    ],
  },
];

const SAMPLE_COLUMNS = [
  "Plot Point",
  "Physical Layer",
  "Invisible Layer",
  "Theme",
];

const FEATURES = [
  {
    icon: Rows3,
    title: "Rows are chapters",
    body: "Start with Chapter 1 and grow the manuscript as you outline — insert a chapter anywhere, rename any row, delete the ones that never belonged.",
  },
  {
    icon: Columns3,
    title: "Layers are columns",
    body: "Plot Point, Physical Layer, Invisible Layer and Theme come pre-set. Add as many lenses as your story needs and retitle them on a click.",
  },
  {
    icon: MousePointerClick,
    title: "Click a card to write",
    body: "Every cell is a card. Click it and it expands into a full writing surface, then saves itself quietly as you type.",
  },
  {
    icon: GripVertical,
    title: "Drag it anywhere",
    body: "An idea in the wrong place is one drag from the right one. Drop a card onto its neighbour and the two trade places.",
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  const enterApp = () => {
    navigate(isAuthenticated ? "/dashboard" : "/auth?returnTo=/dashboard");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-void"
    >
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-void/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-baseline gap-2.5">
            <ScrollText className="size-4 translate-y-0.5 text-gilt" />
            <span className="font-display text-base tracking-[0.18em] text-vellum">
              PLOTGRID
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={enterApp}
              className="label-caps hidden text-ash transition-colors hover:text-gilt sm:block"
            >
              {isLoading ? "…" : isAuthenticated ? "Your grid" : "Sign in"}
            </button>
            <Button
              onClick={enterApp}
              className="h-9 cursor-pointer gap-2 bg-gilt px-4 text-void hover:bg-gilt/90"
            >
              Open the grid
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="rule-gold h-px w-full" />
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,oklch(0.785_0.132_78/10%),transparent_55%),radial-gradient(ellipse_at_bottom_left,oklch(0.72_0.115_230/8%),transparent_50%)]" />
        <div className="relative mx-auto w-full max-w-[1400px] px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
            <div>
              <p className="label-caps text-gilt">A grid for novelists</p>
              <h1 className="mt-5 font-display text-[13vw] leading-[0.86] tracking-[0.04em] text-vellum sm:text-[8vw] lg:text-[5rem]">
                <span className="block">EVERY</span>
                <span className="block">CHAPTER,</span>
                <span className="block text-gilt">LAID BARE</span>
              </h1>
              <div className="rule-gold mt-7 h-px w-full max-w-md" />
              <p className="mt-6 max-w-xl font-serif text-lg leading-8 text-ash sm:text-xl sm:leading-9">
                Chapters down the left, story layers across the top, and a card
                at every crossing. Write the plot point, the physical layer, the
                invisible layer and the theme of each chapter — then drag ideas
                until the structure holds.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  onClick={enterApp}
                  className="h-11 cursor-pointer gap-2 bg-gilt px-6 font-medium text-void hover:bg-gilt/90"
                >
                  Start your grid
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    document
                      .getElementById("how")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="h-11 cursor-pointer border-border/70 bg-background/40 px-6 text-vellum hover:border-gilt/60 hover:text-gilt"
                >
                  See how it works
                </Button>
              </div>
              <div className="mt-8 border-l-2 border-gilt pl-5">
                <blockquote className="font-display text-lg leading-8 tracking-[0.04em] text-vellum sm:text-xl">
                  “Structure is not a cage. It is the trellis the story climbs.”
                </blockquote>
                <figcaption className="label-caps mt-3 text-ash">
                  On outlining in layers
                </figcaption>
              </div>
            </div>

            {/* Miniature grid */}
            <div className="grain overflow-hidden rounded-lg border border-border/70 bg-void shadow-[0_30px_80px_-30px_oklch(0_0_0/0.8)]">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                <p className="label-caps text-vellum/90">Untitled Novel</p>
                <p className="label-caps text-gilt/90">3 rows · 4 layers</p>
              </div>
              <div className="overflow-x-auto">
                <div className="grid min-w-[680px] grid-cols-[130px_repeat(4,minmax(135px,1fr))]">
                  <div className="sticky left-0 z-10 border-b border-r border-border/60 bg-abyss/80 px-3 py-2.5">
                    <p className="label-caps text-gilt/80">Chapters</p>
                  </div>
                  {SAMPLE_COLUMNS.map((column) => (
                    <div
                      key={column}
                      className="border-b border-r border-border/60 bg-abyss/80 px-3 py-2.5"
                    >
                      <p className="font-display text-[13px] leading-tight text-gilt">
                        {column}
                      </p>
                    </div>
                  ))}

                  {SAMPLE_ROWS.map((row, rowIndex) => (
                    <motion.div
                      key={row.chapter}
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{
                        delay: 0.15 + rowIndex * 0.12,
                        duration: 0.5,
                      }}
                      className="contents"
                    >
                      <div className="sticky left-0 z-10 border-b border-r border-border/60 bg-void px-3 py-3">
                        <p className="label-caps text-gilt/70">
                          Row {String(rowIndex + 1).padStart(2, "0")}
                        </p>
                        <p className="mt-1 font-display text-[13px] text-vellum">
                          {row.chapter}
                        </p>
                      </div>
                      {row.cells.map((cell, cellIndex) => (
                        <div
                          key={cellIndex}
                          className="border-b border-r border-border/60 p-2"
                        >
                          <div
                            className={`flex min-h-[76px] rounded-lg border p-2.5 ${
                              row.highlight && cellIndex === 1
                                ? "border-gilt/70 bg-gilt/10"
                                : "border-border/60 bg-abyss/50"
                            }`}
                          >
                            {cell ? (
                              <p className="line-clamp-3 font-serif text-[12.5px] leading-5 text-vellum/85">
                                {cell}
                              </p>
                            ) : (
                              <span className="label-caps mt-auto text-ash/50">
                                + card
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        id="how"
        className="border-b border-border/60 bg-abyss/40 py-14 sm:py-20"
      >
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">
          <div className="mb-10 border-b border-border/60 pb-5">
            <p className="label-caps text-gilt/90">How it works</p>
            <h2 className="mt-3 font-display text-3xl leading-none tracking-tight text-vellum sm:text-4xl">
              Four habits of a finished outline
            </h2>
            <p className="mt-4 max-w-sm text-[15px] leading-7 text-ash">
              Everything is editable: rows, columns and the cards between them.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, index) => (
              <motion.article
                key={feature.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: index * 0.07 }}
                className="group rounded-lg border border-border/70 bg-void p-5 transition-colors hover:border-gilt/50"
              >
                <div className="flex size-10 items-center justify-center rounded-md border border-gilt/40 bg-gilt/10 text-gilt">
                  <feature.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-display text-lg leading-tight tracking-tight text-vellum">
                  {feature.title}
                </h3>
                <div className="rule-gold my-3 h-px w-full opacity-60" />
                <p className="text-[15px] leading-7 text-ash">{feature.body}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.785_0.132_78/9%),transparent_60%)]" />
        <div className="relative mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
          <p className="label-caps text-gilt">Your novel is waiting</p>
          <h2 className="mt-4 font-display text-4xl leading-[0.95] tracking-[0.03em] text-vellum sm:text-5xl">
            OPEN THE FIRST ROW
          </h2>
          <p className="mx-auto mt-5 max-w-xl font-serif text-lg leading-8 text-ash">
            One chapter, four layers, a blank card under each. The grid fills
            the way a manuscript does — one crossing at a time.
          </p>
          <Button
            onClick={enterApp}
            className="mt-8 h-11 cursor-pointer gap-2 bg-gilt px-7 font-medium text-void hover:bg-gilt/90"
          >
            Enter your plot grid
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="rule-gold h-px w-full" />
        <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-3 px-4 py-6 sm:flex-row sm:px-6">
          <p className="label-caps text-ash">Plotgrid · a codex for novels</p>
          <p className="label-caps text-ash/60">rows · layers · cards · drag</p>
        </div>
      </footer>
    </motion.div>
  );
}
