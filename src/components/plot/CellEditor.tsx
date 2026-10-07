import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * The expanded view of a grid card: a large typing surface for one cell.
 * Saves are debounced while typing and flushed when the dialog closes, so
 * nothing is lost if the browser goes away mid-thought.
 */
export function CellEditor({
  open,
  onOpenChange,
  chapterTitle,
  columnTitle,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterTitle: string;
  columnTitle: string;
  value: string;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const saveRef = useRef(onSave);
  const dirtyRef = useRef(false);
  const seededRef = useRef(false);

  // Track the latest saver so a pending flush always writes to the right cell.
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  // Seed the draft once per opening. Re-seeding on every server echo would
  // clobber text typed after a save (e.g. a just-typed trailing space).
  useEffect(() => {
    if (open && !seededRef.current) {
      seededRef.current = true;
      draftRef.current = value;
      dirtyRef.current = false;
      setDraft(value);
    } else if (!open) {
      seededRef.current = false;
    }
  }, [open, value]);

  // Debounced autosave while typing.
  useEffect(() => {
    if (!open || !dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      dirtyRef.current = false;
      saveRef.current(draftRef.current);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draft, open]);

  // Flush anything pending if the whole editor unmounts mid-sentence.
  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        saveRef.current(draftRef.current);
      }
    };
  }, []);

  // Single gate for every close path (Escape, X, backdrop click): flush first.
  const handleOpenChange = (next: boolean) => {
    if (!next && dirtyRef.current) {
      dirtyRef.current = false;
      saveRef.current(draftRef.current);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-5 border-gilt/40 bg-abyss sm:max-w-2xl [&_[data-slot=dialog-close]]:text-vellum">
        <DialogHeader>
          <p className="label-caps text-gilt">{columnTitle}</p>
          <DialogTitle className="font-display text-2xl leading-tight tracking-tight text-vellum">
            {chapterTitle}
          </DialogTitle>
          <DialogDescription className="text-ash">
            Type freely — changes save as you go.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          value={draft}
          onChange={(event) => {
            dirtyRef.current = true;
            draftRef.current = event.target.value;
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            // Route Escape through the flushing handler; Radix would otherwise
            // close the dialog before this keystroke's text reaches the server.
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              handleOpenChange(false);
            }
          }}
          placeholder="What happens here?"
          className="min-h-[45vh] resize-none rounded-md border-border/70 bg-void/60 px-4 py-3 font-serif text-lg leading-8 text-vellum placeholder:text-ash/60 focus-visible:border-gilt/70 focus-visible:ring-gilt/40"
        />
        <p className="label-caps text-ash/70">
          {draft.trim().length} characters · esc to close
        </p>
      </DialogContent>
    </Dialog>
  );
}
