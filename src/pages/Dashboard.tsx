import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "@/hooks/use-auth";
import { LogoDropdown } from "@/components/LogoDropdown";
import { PlotGrid } from "@/components/plot/PlotGrid";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, PenLine } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** localStorage key remembering this device's board across sessions. */
const BOARD_MARKER = "plotgrid:board";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const board = useQuery(api.plot.getBoard);
  const ensureBoard = useMutation(api.plot.ensureBoard);
  const claimBoard = useMutation(api.plot.claimBoard);
  const renameBoard = useMutation(api.plot.renameBoard);
  const bootstrapped = useRef(false);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [bootError, setBootError] = useState(false);

  // Persist a marker so a board written before signing in (guest session)
  // can be claimed back after login instead of starting over.
  useEffect(() => {
    if (board) {
      try {
        localStorage.setItem(BOARD_MARKER, board.boardId);
      } catch {
        // Storage unavailable (private mode) — nothing to restore later.
      }
    }
  }, [board]);

  // First visit for this account: try to reclaim a board remembered on this
  // device, otherwise create the starter grid (Chapter 1 x four layers).
  useEffect(() => {
    if (board !== null || bootstrapped.current) return;
    bootstrapped.current = true;
    setBootError(false);

    let claimed: string | null = null;
    try {
      claimed = localStorage.getItem(BOARD_MARKER);
    } catch {
      claimed = null;
    }
    // Wrapped so even a synchronously-rejected malformed id is caught; a bad
    // marker then falls back to a fresh grid, while a network failure in
    // ensureBoard below still lands on the retry screen.
    const restore = claimed
      ? Promise.resolve()
          .then(() => claimBoard({ boardId: claimed as Id<"boards"> }))
          .catch(() => null)
      : Promise.resolve(null);

    restore
      .then(async (restoredId) => {
        if (restoredId) {
          toast.success("Welcome back — your grid was restored");
          return;
        }
        await ensureBoard({});
      })
      .catch(() => {
        // Network hiccup: allow a retry instead of an endless spinner.
        bootstrapped.current = false;
        setBootError(true);
        toast.error("Couldn't open your plot grid");
      });
  }, [board, bootAttempt, claimBoard, ensureBoard]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        {bootError ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="font-display text-xl text-vellum">
              Couldn&rs;t open your grid
            </p>
            <p className="max-w-sm text-[15px] leading-6 text-ash">
              Your work is safe — check your connection and try again.
            </p>
            <Button
              type="button"
              className="cursor-pointer gap-2 bg-gilt text-void hover:bg-gilt/90"
              onClick={() => {
                setBootError(false);
                setBootAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="size-6 animate-spin text-gilt" />
            <p className="label-caps text-ash">Opening your codex</p>
          </div>
        )}
      </main>
    );
  }

  const allCards = Object.values(board.cells).flat();
  const filled = allCards.filter((card) => card.content.trim()).length;
  const total = allCards.length;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-void/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <LogoDropdown />
            <div className="hidden h-8 w-px bg-border/70 sm:block" />
            <BoardTitle
              title={board.title}
              onCommit={(title) =>
                renameBoard({ boardId: board.boardId, title }).catch(() =>
                  toast.error("Couldn't rename your project"),
                )
              }
            />
          </div>

          <p className="label-caps hidden text-ash md:block">
            {board.chapters.length} rows · {board.columns.length} layers ·{" "}
            <span className="text-gilt">{filled}</span>/{total} cards written
          </p>

          <div className="ml-auto flex items-center gap-3">
            <p className="label-caps hidden text-ash sm:block">
              {user?.name ?? user?.email ?? "Author"}
            </p>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer gap-2 border-border/70 hover:border-gilt/60 hover:text-gilt"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
        <div className="rule-gold h-px w-full" />
      </header>

      <section className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-caps text-gilt">The plot grid</p>
            <h1 className="mt-2 font-display text-2xl leading-none tracking-tight text-vellum sm:text-3xl">
              Chapter by chapter
            </h1>
          </div>
          <p className="max-w-md text-[15px] leading-6 text-ash">
            Each row is a chapter, each layer a lens on it. Click a card to
            write, drag it anywhere to rearrange.
          </p>
        </div>

        <PlotGrid data={board} />
      </section>
    </main>
  );
}

/** Editable project title in the header. */
function BoardTitle({
  title,
  onCommit,
}: {
  title: string;
  onCommit: (title: string) => void;
}) {
  const [draft, setDraft] = useState(title);
  const [editing, setEditing] = useState(false);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== title) onCommit(next);
    else setDraft(title);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(title);
          setEditing(true);
        }}
        aria-label={`Project title: ${title}. Click to edit.`}
        className="group/title flex min-w-0 items-center gap-2"
      >
        <span className="truncate font-display text-lg tracking-tight text-vellum group-hover/title:text-gilt">
          {title}
        </span>
        <PenLine className="size-3.5 shrink-0 text-ash/50 opacity-0 transition-opacity group-hover/title:opacity-100" />
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      aria-label="Project title"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") {
          setDraft(title);
          setEditing(false);
        }
      }}
      className={cn(
        "w-56 rounded-sm border border-gilt/60 bg-void px-2 py-1 font-display text-lg text-vellum outline-none",
      )}
    />
  );
}
