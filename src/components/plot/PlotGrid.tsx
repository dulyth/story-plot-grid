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
  ChevronDown,
  ChevronUp,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

export type CardInSlot = { id: Id<"cells">; content: string };

export type BoardData = {
  boardId: Id<"boards">;
  title: string;
  chapters: { id: Id<"chapters">; title: string }[];
  columns: { id: Id<"plotColumns">; title: string }[];
  /** Slot key → cards in that slot, in display order (slots stack). */
  cells: Record<string, CardInSlot[]>;
};

type CellRef = { chapterId: Id<"chapters">; columnId: Id<"plotColumns"> };
type DragRef = CellRef & { cardId: Id<"cells"> };

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
  const addCard = useMutation(api.plot.addCard);
  const setCard = useMutation(api.plot.setCard);
  const deleteCard = useMutation(api.plot.deleteCard);
  const moveCard = useMutation(api.plot.moveCard);

  const [editing, setEditing] = useState<
    (DragRef & { chapterTitle: string; columnTitle: string }) | null
  >(null);
  const [dragging, setDragging] = useState<DragRef | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Where a card would land if dropped right now: insertion bar visuals.
  const [insertPoint, setInsertPoint] = useState<{
    key: string;
    cardId: Id<"cells">;
    edge: "top" | "bottom";
  } | null>(null);
  // State updates from dragstart are async; a ref guarantees dragover/drop
  // handlers see the drag as active on their very first invocation.
  const draggingRef = useRef<DragRef | null>(null);
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
  // Latest editor text for the card being edited (see saveCard).
  const lastTextRef = useRef("");
  // Element that started the current/last drag, to swallow its trailing click.
  const draggedElRef = useRef<HTMLElement | null>(null);

  const openCell = (
    ref: DragRef,
    chapterTitle: string,
    columnTitle: string,
  ) => {
    lastTextRef.current =
      cells[cellKey(ref.chapterId, ref.columnId)]?.find(
        (card) => card.id === ref.cardId,
      )?.content ?? "";
    setEditing({ ...ref, chapterTitle, columnTitle });
  };

  /** Start a new card in a slot and open it for writing. */
  const startCard = (
    ref: CellRef,
    chapterTitle: string,
    columnTitle: string,
  ) => {
    lastTextRef.current = "";
    addCard({ boardId, chapterId: ref.chapterId, columnId: ref.columnId }).then(
      (cardId) => setEditing({ ...ref, cardId, chapterTitle, columnTitle }),
      () => toast.error("Couldn't add a card"),
    );
  };

  /**
   * Write-through from the editor. Tracks the latest text so the close handler
   * can tell whether the card ended up empty — mid-edit clears are never
   * deletes, only closing on an empty card is.
   */
  const saveCard = (text: string) => {
    lastTextRef.current = text;
    if (!editing) return;
    run(
      setCard({ cardId: editing.cardId, content: text }),
      "Couldn't save that card",
    );
  };

  const clearDragUi = () => {
    draggingRef.current = null;
    setDragging(null);
    setDropTarget(null);
    setInsertPoint(null);
  };

  /**
   * Resolve a drop on (or between) cards to a concrete index.
   *
   * `toIndex` is the card's final index among the other cards of that slot —
   * exactly what the backend splices into — so it works for moving between
   * cells (append/reference-relative) and reordering inside one cell alike.
   */
  const resolveDrop = (
    source: DragRef,
    target: CellRef,
    referenceCardId: Id<"cells"> | null,
    edge: "top" | "bottom",
  ): number | undefined => {
    const list = cells[cellKey(target.chapterId, target.columnId)] ?? [];
    const sameSlot =
      source.chapterId === target.chapterId &&
      source.columnId === target.columnId;

    if (referenceCardId === null) {
      // Dropped on the cell's empty background: append across cells, but a
      // same-slot background drop is a no-op so a stray drop can't reshuffle.
      return sameSlot ? undefined : list.length;
    }

    const from = sameSlot
      ? list.findIndex((c) => c.id === source.cardId)
      : -1;
    const referenceIndex = list.findIndex((c) => c.id === referenceCardId);
    if (referenceIndex === -1) return list.length;

    let toIndex = referenceIndex + (edge === "bottom" ? 1 : 0);
    // Removing the dragged card shifts later positions down by one.
    if (from !== -1 && toIndex > from) toIndex -= 1;
    return toIndex;
  };

  const handleDrop = (
    target: CellRef,
    referenceCardId: Id<"cells"> | null = null,
    edge: "top" | "bottom" = "top",
  ) => {
    const source = draggingRef.current;
    clearDragUi();
    if (!source) return;

    const toIndex = resolveDrop(source, target, referenceCardId, edge);
    if (
      source.chapterId === target.chapterId &&
      source.columnId === target.columnId &&
      toIndex === undefined
    )
      return;

    const sameSlot =
      source.chapterId === target.chapterId &&
      source.columnId === target.columnId;
    // The card lands inside the target slot's stack at the chosen position —
    // slots stack cards; nothing is swapped or overwritten.
    moveCard({
      cardId: source.cardId,
      toChapterId: target.chapterId,
      toColumnId: target.columnId,
      ...(toIndex === undefined ? {} : { toIndex }),
    }).then(
      () => toast.success(sameSlot ? "Card reordered" : "Card stacked into that slot"),
      () => toast.error("Couldn't move that card"),
    );
  };

  /** Move a card one place up/down inside its own cell. */
  const nudgeCard = (card: CardInSlot, index: number, delta: -1 | 1, slot: CellRef) => {
    const list = cells[cellKey(slot.chapterId, slot.columnId)] ?? [];
    const toIndex = Math.max(0, Math.min(index + delta, list.length - 1));
    if (toIndex === index) return;
    run(
      moveCard({
        cardId: card.id,
        toChapterId: slot.chapterId,
        toColumnId: slot.columnId,
        toIndex,
      }),
      "Couldn't reorder card",
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
                          cards: chapters.reduce(
                            (total, ch) =>
                              total +
                              (cells[cellKey(ch.id, column.id)]?.length ?? 0),
                            0,
                          ),
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
                          cards: columns.reduce(
                            (total, col) =>
                              total +
                              (cells[cellKey(chapter.id, col.id)]?.length ?? 0),
                            0,
                          ),
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                      Delete row
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Cards — a slot is a stack: add or drop as many as you like */}
              {columns.map((column) => {
                const key = cellKey(chapter.id, column.id);
                const cards = cells[key] ?? [];
                const isTarget = dropTarget === key;

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
                      // Dropped on the cell background (not on a card): append.
                      handleDrop({
                        chapterId: chapter.id,
                        columnId: column.id,
                      });
                    }}
                    className={cn(
                      "flex flex-col gap-2 border-b border-r border-border/70 p-2 transition-colors",
                      rowIndex % 2 === 1 && "bg-abyss/25",
                      isTarget && "bg-gilt/10",
                    )}
                  >
                    {cards.map((card, cardIndex) => {
                      const isDragging = dragging?.cardId === card.id;
                      const filled = card.content.trim().length > 0;
                      const isInsertHere =
                        insertPoint?.key === key &&
                        insertPoint.cardId === card.id;
                      const markerEdge = isInsertHere
                        ? insertPoint.edge
                        : null;

                      return (
                        <div
                          key={card.id}
                          className="relative"
                          onDragOver={(event) => {
                            if (!draggingRef.current) return;
                            event.preventDefault();
                            event.stopPropagation();
                            event.dataTransfer.dropEffect = "move";
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            const edge =
                              event.clientY < rect.top + rect.height / 2
                                ? "top"
                                : "bottom";
                            if (
                              insertPoint?.cardId !== card.id ||
                              insertPoint.edge !== edge
                            ) {
                              setInsertPoint({
                                key,
                                cardId: card.id,
                                edge,
                              });
                            }
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            const edge =
                              event.clientY < rect.top + rect.height / 2
                                ? "top"
                                : "bottom";
                            handleDrop(
                              {
                                chapterId: chapter.id,
                                columnId: column.id,
                              },
                              card.id,
                              edge,
                            );
                          }}
                        >
                          {/* Insertion bar: where the card would land */}
                          {markerEdge === "top" && (
                            <span
                              aria-hidden
                              className="absolute -top-[5px] left-0 right-0 z-10 h-[3px] rounded-full bg-gilt shadow-[0_0_6px_oklch(0.785_0.132_78/0.7)]"
                            />
                          )}
                          {markerEdge === "bottom" && (
                            <span
                              aria-hidden
                              className="absolute -bottom-[5px] left-0 right-0 z-10 h-[3px] rounded-full bg-gilt shadow-[0_0_6px_oklch(0.785_0.132_78/0.7)]"
                            />
                          )}
                        <div
                          role="button"
                          tabIndex={0}
                          draggable
                          onDragStart={(event) => {
                            const ref = {
                              cardId: card.id,
                              chapterId: chapter.id,
                              columnId: column.id,
                            };
                            dragStartedAt.current = Date.now();
                            draggedElRef.current = event.currentTarget;
                            draggingRef.current = ref;
                            setDragging(ref);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              "text/plain",
                              `${chapter.title} · ${column.title}`,
                            );
                          }}
                          onDragEnd={() => {
                            clearDragUi();
                            // Restart the guard window so the click some browsers
                            // fire right after a drop doesn't reopen the card.
                            dragStartedAt.current = Date.now();
                          }}
                          onClick={(event) => {
                            // Some browsers fire a click right after a drag;
                            // ignore only that one, on the dragged card itself.
                            if (draggingRef.current) return;
                            if (
                              draggedElRef.current === event.currentTarget &&
                              Date.now() - dragStartedAt.current < 350
                            ) {
                              draggedElRef.current = null;
                              return;
                            }
                            openCell(
                              {
                                cardId: card.id,
                                chapterId: chapter.id,
                                columnId: column.id,
                              },
                              chapter.title,
                              column.title,
                            );
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openCell(
                                {
                                  cardId: card.id,
                                  chapterId: chapter.id,
                                  columnId: column.id,
                                },
                                chapter.title,
                                column.title,
                              );
                            }
                          }}
                          className={cn(
                            "group/card relative flex min-h-[92px] w-full cursor-grab flex-col rounded-lg border bg-abyss/50 p-3 text-left transition-all active:cursor-grabbing",
                            isDragging && "opacity-40",
                            "border-border/60 hover:border-gilt/50 hover:bg-abyss",
                          )}
                        >
                          <GripVertical className="absolute right-2 top-2 size-3.5 text-ash/40 opacity-0 transition-opacity group-hover/card:opacity-100" />
                          {filled ? (
                            <p className="line-clamp-4 whitespace-pre-wrap font-serif text-[15px] leading-6 text-vellum/90">
                              {card.content}
                            </p>
                          ) : (
                            <span className="label-caps mt-auto text-gilt/70">
                              writing…
                            </span>
                          )}
                          {/* In-cell reorder (shown once a cell stacks) */}
                          {cards.length > 1 && (
                            <div className="absolute left-1.5 top-1.5 flex flex-col gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100">
                              <button
                                type="button"
                                aria-label={`Move card up in ${chapter.title} · ${column.title}`}
                                disabled={cardIndex === 0}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  nudgeCard(card, cardIndex, -1, {
                                    chapterId: chapter.id,
                                    columnId: column.id,
                                  });
                                }}
                                onKeyDown={(event) => event.stopPropagation()}
                                className="flex size-4 items-center justify-center rounded-sm border border-border/60 bg-void/80 text-ash transition-colors hover:border-gilt/60 hover:text-gilt disabled:opacity-25 disabled:hover:border-border/60 disabled:hover:text-ash"
                              >
                                <ChevronUp className="size-3" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Move card down in ${chapter.title} · ${column.title}`}
                                disabled={cardIndex === cards.length - 1}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  nudgeCard(card, cardIndex, 1, {
                                    chapterId: chapter.id,
                                    columnId: column.id,
                                  });
                                }}
                                onKeyDown={(event) => event.stopPropagation()}
                                className="flex size-4 items-center justify-center rounded-sm border border-border/60 bg-void/80 text-ash transition-colors hover:border-gilt/60 hover:text-gilt disabled:opacity-25 disabled:hover:border-border/60 disabled:hover:text-ash"
                              >
                                <ChevronDown className="size-3" />
                              </button>
                            </div>
                          )}
                        </div>
                        </div>
                      );
                    })}

                    {/* Add another card to this slot */}
                    <button
                      type="button"
                      aria-label={`Add a card to ${chapter.title} · ${column.title}`}
                      onClick={() =>
                        startCard(
                          { chapterId: chapter.id, columnId: column.id },
                          chapter.title,
                          column.title,
                        )
                      }
                      className={cn(
                        "label-caps flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 transition-colors",
                        cards.length === 0
                          ? "min-h-[92px] border-border/60 text-ash/50 hover:border-gilt/60 hover:text-gilt"
                          : "border-border/50 text-ash/50 hover:border-gilt/60 hover:text-gilt",
                      )}
                    >
                      <Plus className="size-3" />
                      {cards.length === 0 ? "card" : "another card"}
                    </button>
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
              drag a card into any slot to stack it · click a card to write · +
              to add another
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
          if (open) return;
          // Closing on an empty card removes it instead of leaving a blank
          // placeholder in the stack.
          if (editing && !lastTextRef.current.trim()) {
            run(deleteCard({ cardId: editing.cardId }), "Couldn't remove card");
          }
          setEditing(null);
        }}
        chapterTitle={editing?.chapterTitle ?? ""}
        columnTitle={editing?.columnTitle ?? ""}
        value={
          editing
            ? (cells[cellKey(editing.chapterId, editing.columnId)]?.find(
                (card) => card.id === editing.cardId,
              )?.content ?? "")
            : ""
        }
        onSave={saveCard}
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
