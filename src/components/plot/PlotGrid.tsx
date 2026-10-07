import { Fragment, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CellEditor } from "./CellEditor";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

export type BoardData = {
  boardId: Id<"boards">;
  title: string;
  chapters: { id: Id<"chapters">; title: string }[];
  columns: { id: Id<"plotColumns">; title: string }[];
  cells: Record<string, string>;
};

type CellRef = { chapterId: Id<"chapters">; columnId: Id<"plotColumns"> };

const cellKey = (chapterId: string, columnId: string) =>
  `${chapterId}:${columnId}`;

/**
 * The plot grid itself: rows are chapters, columns are story layers, and each
 * intersection holds a draggable card that expands into a typing surface.
 */
export function PlotGrid({ data }: { data: BoardData }) {
  const { boardId, chapters, columns, cells } = data;

  const insertChapter = useMutation(api.plot.insertChapter);
  const renameChapter = useMutation(api.plot.renameChapter);
  const deleteChapter = useMutation(api.plot.deleteChapter);
  const insertColumn = useMutation(api.plot.insertColumn);
  const renameColumn = useMutation(api.plot.renameColumn);
  const deleteColumn = useMutation(api.plot.deleteColumn);
  const setCell = useMutation(api.plot.setCell);
  const moveCell = useMutation(api.plot.moveCell);

  const [editing, setEditing] = useState<
    (CellRef & { chapterTitle: string; columnTitle: string }) | null
  >(null);
  const [dragging, setDragging] = useState<CellRef | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // State updates from dragstart are async; a ref guarantees dragover/drop
  // handlers see the drag as active on their very first invocation.
  const draggingRef = useRef<CellRef | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    | {
        kind: "chapter";
        chapterId: Id<"chapters">;
        title: string;
        cards: number;
      }
    | {
        kind: "column";
        columnId: Id<"plotColumns">;
        title: string;
        cards: number;
      }
    | null
  >(null);
  const dragStartedAt = useRef(0);

  const openCell = (
    ref: CellRef,
    chapterTitle: string,
    columnTitle: string,
  ) => {
    setEditing({ ...ref, chapterTitle, columnTitle });
  };

  const saveCell = (ref: CellRef, text: string) => {
    setCell({
      boardId,
      chapterId: ref.chapterId,
      columnId: ref.columnId,
      content: text,
    }).catch(() => toast.error("Couldn't save that card"));
  };

  const handleDrop = (target: CellRef) => {
    const source = draggingRef.current;
    draggingRef.current = null;
    setDragging(null);
    setDropTarget(null);
    if (!source) return;
    if (
      source.chapterId === target.chapterId &&
      source.columnId === target.columnId
    )
      return;
    moveCell({
      boardId,
      fromChapterId: source.chapterId,
      fromColumnId: source.columnId,
      toChapterId: target.chapterId,
      toColumnId: target.columnId,
    }).then(
      () => toast.success("Card moved"),
      () => toast.error("Couldn't move that card"),
    );
  };

  const run = (promise: Promise<unknown>, error: string) => {
    promise.catch(() => toast.error(error));
  };

  return (
    <div className="grain relative overflow-hidden rounded-xl border border-border/70 bg-void">
      {/* Single scroll container so headers track rows horizontally */}
      <div className="max-h-[calc(100vh-16rem)] overflow-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `minmax(180px, 220px) repeat(${columns.length}, minmax(240px, 1fr)) 56px`,
          }}
        >
          {/* Sticky layer (column) header */}
          <div className="sticky left-0 top-0 z-30 flex items-end border-b border-r border-border/70 bg-abyss px-4 py-3">
            <div>
              <p className="label-caps text-gilt/80">Manuscript</p>
              <p className="mt-1 font-display text-sm text-vellum/90">
                Chapters
              </p>
            </div>
          </div>

          {columns.map((column, columnIndex) => (
            <div
              key={column.id}
              className="group/col relative sticky top-0 z-20 border-b border-r border-border/70 bg-abyss px-4 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <RenameField
                  value={column.title}
                  ariaLabel="Rename column"
                  className="font-display text-[15px] leading-tight tracking-tight text-gilt"
                  onCommit={(title) =>
                    run(
                      renameColumn({ columnId: column.id, title }),
                      "Couldn't rename column",
                    )
                  }
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Options for ${column.title}`}
                      className="size-7 shrink-0 text-ash opacity-0 transition-opacity group-hover/col:opacity-100 hover:text-gilt hover:bg-gilt/10 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-52 border-border/70 bg-abyss"
                  >
                    <DropdownMenuItem
                      onClick={() =>
                        run(
                          insertColumn({ boardId, index: columnIndex + 1 }),
                          "Couldn't add column",
                        )
                      }
                    >
                      <Plus className="size-4" />
                      Insert column right
                    </DropdownMenuItem>{" "}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-ember focus:text-ember"
                      onClick={() =>
                        setPendingDelete({
                          kind: "column",
                          columnId: column.id,
                          title: column.title,
                          cards: chapters.filter((ch) =>
                            cells[cellKey(ch.id, column.id)]?.trim(),
                          ).length,
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                      Delete column
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="label-caps mt-2 text-ash/70">
                {String(columnIndex + 1).padStart(2, "0")} / {columns.length}
              </p>
            </div>
          ))}

          <div className="sticky top-0 z-20 flex items-center justify-center border-b border-border/70 bg-abyss">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Add column"
              title="Add column"
              className="size-8 text-ash hover:text-gilt hover:bg-gilt/10"
              onClick={() =>
                run(insertColumn({ boardId }), "Couldn't add column")
              }
            >
              <Plus className="size-4" />
            </Button>
          </div>
          {chapters.map((chapter, rowIndex) => (
            <Fragment key={chapter.id}>
              {/* Row gutter */}
              <div
                className={cn(
                  "group/row sticky left-0 z-10 flex items-start justify-between gap-2 border-b border-r border-border/70 px-4 py-3",
                  // Solid fill: the gutter overlays scrolling cards horizontally.
                  rowIndex % 2 === 1 ? "bg-abyss" : "bg-void",
                )}
              >
                <div className="min-w-0">
                  <p className="label-caps text-gilt/70">
                    Row {String(rowIndex + 1).padStart(2, "0")}
                  </p>
                  <RenameField
                    value={chapter.title}
                    ariaLabel="Rename chapter"
                    className="mt-1 block w-full truncate font-display text-[15px] leading-tight tracking-tight text-vellum"
                    onCommit={(title) =>
                      run(
                        renameChapter({ chapterId: chapter.id, title }),
                        "Couldn't rename chapter",
                      )
                    }
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Options for ${chapter.title}`}
                      className="size-7 shrink-0 text-ash opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-gilt hover:bg-gilt/10 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-56 border-border/70 bg-abyss"
                  >
                    <DropdownMenuItem
                      onClick={() =>
                        run(
                          insertChapter({ boardId, index: rowIndex }),
                          "Couldn't insert chapter",
                        )
                      }
                    >
                      <ArrowUpToLine className="size-4" />
                      Insert row above
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        run(
                          insertChapter({ boardId, index: rowIndex + 1 }),
                          "Couldn't insert chapter",
                        )
                      }
                    >
                      <ArrowDownToLine className="size-4" />
                      Insert row below
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-ember focus:text-ember"
                      onClick={() =>
                        setPendingDelete({
                          kind: "chapter",
                          chapterId: chapter.id,
                          title: chapter.title,
                          cards: columns.filter((col) =>
                            cells[cellKey(chapter.id, col.id)]?.trim(),
                          ).length,
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                      Delete row
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Cards */}
              {columns.map((column) => {
                const key = cellKey(chapter.id, column.id);
                const content = cells[key] ?? "";
                const isDragging =
                  dragging?.chapterId === chapter.id &&
                  dragging?.columnId === column.id;
                const isTarget = dropTarget === key;
                const filled = content.trim().length > 0;

                return (
                  <div
                    key={key}
                    onDragOver={(event) => {
                      if (!draggingRef.current) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (dropTarget !== key) setDropTarget(key);
                    }}
                    onDragLeave={() => {
                      if (dropTarget === key) setDropTarget(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDrop({
                        chapterId: chapter.id,
                        columnId: column.id,
                      });
                    }}
                    className={cn(
                      "border-b border-r border-border/70 p-2 transition-colors",
                      rowIndex % 2 === 1 && "bg-abyss/25",
                      isTarget && "bg-gilt/10",
                    )}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={(event) => {
                        const ref = {
                          chapterId: chapter.id,
                          columnId: column.id,
                        };
                        dragStartedAt.current = Date.now();
                        draggingRef.current = ref;
                        setDragging(ref);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "text/plain",
                          `${chapter.title} · ${column.title}`,
                        );
                      }}
                      onDragEnd={() => {
                        draggingRef.current = null;
                        setDragging(null);
                        setDropTarget(null);
                        // Restart the guard window so the click some browsers
                        // fire right after a drop doesn't reopen the card.
                        dragStartedAt.current = Date.now();
                      }}
                      onClick={() => {
                        // Some browsers fire a click right after a drag; ignore it.
                        if (draggingRef.current) return;
                        if (Date.now() - dragStartedAt.current < 350) return;
                        openCell(
                          { chapterId: chapter.id, columnId: column.id },
                          chapter.title,
                          column.title,
                        );
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openCell(
                            { chapterId: chapter.id, columnId: column.id },
                            chapter.title,
                            column.title,
                          );
                        }
                      }}
                      className={cn(
                        "group/card relative flex min-h-[104px] w-full cursor-grab flex-col rounded-lg border bg-abyss/50 p-3 text-left transition-all active:cursor-grabbing",
                        isDragging && "opacity-40",
                        isTarget
                          ? "border-gilt/70 bg-gilt/10 shadow-[0_0_0_1px_rgba(0,0,0,0)]"
                          : "border-border/60 hover:border-gilt/50 hover:bg-abyss",
                      )}
                    >
                      <GripVertical className="absolute right-2 top-2 size-3.5 text-ash/40 opacity-0 transition-opacity group-hover/card:opacity-100" />
                      {filled ? (
                        <p className="line-clamp-4 whitespace-pre-wrap font-serif text-[15px] leading-6 text-vellum/90">
                          {content}
                        </p>
                      ) : (
                        <span className="label-caps mt-auto text-ash/50 group-hover/card:text-gilt/70">
                          + card
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* trailing gutter under the + column button */}
              <div
                className={cn(
                  "border-b border-border/70",
                  rowIndex % 2 === 1 && "bg-abyss/25",
                )}
              />
            </Fragment>
          ))}

          {/* Add-row footer cell */}
          <div className="sticky left-0 z-10 border-b border-r border-border/70 bg-void p-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 border-gilt/40 bg-gilt/10 text-gilt hover:bg-gilt/20 hover:text-gilt"
              onClick={() =>
                run(insertChapter({ boardId }), "Couldn't add chapter")
              }
            >
              <Plus className="size-4" />
              Add row
            </Button>
          </div>
          <div
            className="flex items-center justify-center border-b border-border/70"
            style={{ gridColumn: `span ${columns.length + 1}` }}
          >
            <p className="label-caps text-ash/50">
              drag a card onto another to move it · click a card to write
            </p>
          </div>
        </div>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="border-gilt/40 bg-abyss">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-vellum">
              Delete “{pendingDelete?.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ash">
              {pendingDelete?.cards
                ? `This also removes ${pendingDelete.cards} written card${pendingDelete.cards === 1 ? "" : "s"}.`
                : "Nothing written sits here yet."}{" "}
              This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/70 bg-transparent text-vellum hover:bg-abyss hover:text-gilt">
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return;
                if (pendingDelete.kind === "chapter") {
                  run(
                    deleteChapter({ chapterId: pendingDelete.chapterId }),
                    "Couldn't delete chapter",
                  );
                } else {
                  run(
                    deleteColumn({ columnId: pendingDelete.columnId }),
                    "Couldn't delete column",
                  );
                }
                setPendingDelete(null);
              }}
              className="bg-ember text-void hover:bg-ember/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CellEditor
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        chapterTitle={editing?.chapterTitle ?? ""}
        columnTitle={editing?.columnTitle ?? ""}
        value={
          editing
            ? (cells[cellKey(editing.chapterId, editing.columnId)] ?? "")
            : ""
        }
        onSave={(text) => {
          if (editing) saveCell(editing, text);
        }}
      />
    </div>
  );
}

/** A title that reads as text until clicked, then becomes an input. */
function RenameField({
  value,
  onCommit,
  className,
  ariaLabel,
}: {
  value: string;
  onCommit: (title: string) => void;
  className?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`${ariaLabel}: ${value}. Click to edit.`}
        title={value}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={cn(
          "group/name flex min-w-0 items-start gap-1.5 text-left hover:text-gilt focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gilt/60",
          className,
        )}
      >
        <span className="truncate">{value}</span>
        <Pencil className="mt-0.5 size-3 shrink-0 text-ash/40 opacity-0 transition-opacity group-hover/name:opacity-100" />
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={cn(
        "w-full min-w-0 rounded-sm border border-gilt/60 bg-void px-1 py-0.5 text-vellum outline-none",
        className,
      )}
    />
  );
}
