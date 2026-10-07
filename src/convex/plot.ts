import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const DEFAULT_COLUMNS = [
  "Plot Point",
  "Physical Layer",
  "Invisible Layer",
  "Theme",
];

/** Resolve the signed-in user's board, or null when there isn't one yet. */
async function getOwnBoard(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return { userId: null, board: null };
  // .first() rather than .unique(): if two tabs ever race the bootstrap, we
  // still resolve to the same (earliest) board instead of hard-erroring.
  const board = await ctx.db
    .query("boards")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .first();
  return { userId, board };
}

/** Throw unless the caller owns the board these ids belong to. */
async function requireBoard(
  ctx: MutationCtx,
  boardId: Id<"boards">,
): Promise<Doc<"boards">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");
  const board = await ctx.db.get(boardId);
  if (!board || board.ownerId !== userId) throw new Error("Board not found");
  return board;
}

/** Re-number rows/columns 0..n-1 so order stays dense after inserts/deletes. */
async function renumber(
  ctx: MutationCtx,
  boardId: Id<"boards">,
  table: "chapters" | "plotColumns",
) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_board", (q) => q.eq("boardId", boardId))
    .collect();
  rows.sort((a, b) => a.order - b.order);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].order !== i) await ctx.db.patch(rows[i]._id, { order: i });
  }
}

/**
 * Full board payload for the grid: chapters (rows), plotColumns (columns)
 * and every non-empty cell keyed by `${chapterId}:${columnId}`.
 * Returns null until the user is signed in.
 */
export const getBoard = query({
  args: {},
  handler: async (ctx) => {
    const { userId, board } = await getOwnBoard(ctx);
    if (userId === null || board === null) return null;

    const [chapters, plotColumns, cells] = await Promise.all([
      ctx.db
        .query("chapters")
        .withIndex("by_board", (q) => q.eq("boardId", board._id))
        .collect(),
      ctx.db
        .query("plotColumns")
        .withIndex("by_board", (q) => q.eq("boardId", board._id))
        .collect(),
      ctx.db
        .query("cells")
        .withIndex("by_board", (q) => q.eq("boardId", board._id))
        .collect(),
    ]);

    chapters.sort((a, b) => a.order - b.order);
    plotColumns.sort((a, b) => a.order - b.order);

    const cellMap: Record<string, string> = {};
    for (const cell of cells) {
      cellMap[`${cell.chapterId}:${cell.columnId}`] = cell.content;
    }

    return {
      boardId: board._id,
      title: board.title,
      chapters: chapters.map((c) => ({ id: c._id, title: c.title })),
      columns: plotColumns.map((c) => ({ id: c._id, title: c.title })),
      cells: cellMap,
    };
  },
});

/** Create the starter board (Chapter 1 x four default layers) on first sign-in. */
export const ensureBoard = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, board } = await getOwnBoard(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (board !== null) return board._id;

    const boardId = await ctx.db.insert("boards", {
      ownerId: userId,
      title: "Untitled Novel",
      createdAt: Date.now(),
    });
    await ctx.db.insert("chapters", { boardId, title: "Chapter 1", order: 0 });
    for (let i = 0; i < DEFAULT_COLUMNS.length; i++) {
      await ctx.db.insert("plotColumns", {
        boardId,
        title: DEFAULT_COLUMNS[i],
        order: i,
      });
    }
    return boardId;
  },
});

export const renameBoard = mutation({
  args: { boardId: v.id("boards"), title: v.string() },
  handler: async (ctx, { boardId, title }) => {
    await requireBoard(ctx, boardId);
    await ctx.db.patch(boardId, { title: title.trim() || "Untitled Novel" });
  },
});

// ---------------------------------------------------------------------------
// Chapters (rows)
// ---------------------------------------------------------------------------

/** Insert a chapter at `index` (append when omitted); title auto-numbered. */
export const insertChapter = mutation({
  args: {
    boardId: v.id("boards"),
    index: v.optional(v.number()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { boardId, index, title }) => {
    await requireBoard(ctx, boardId);
    const existing = await ctx.db
      .query("chapters")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    existing.sort((a, b) => a.order - b.order);

    const at = Math.max(0, Math.min(index ?? existing.length, existing.length));
    const label = title?.trim() || `Chapter ${existing.length + 1}`;
    const newId = await ctx.db.insert("chapters", {
      boardId,
      title: label,
      order: at,
    });
    // Push everything at/after the insertion point down one slot.
    for (let i = at; i < existing.length; i++) {
      await ctx.db.patch(existing[i]._id, { order: i + 1 });
    }
    await ctx.db.patch(newId, { order: at });
    await renumber(ctx, boardId, "chapters");
    return newId;
  },
});

export const renameChapter = mutation({
  args: { chapterId: v.id("chapters"), title: v.string() },
  handler: async (ctx, { chapterId, title }) => {
    const chapter = await ctx.db.get(chapterId);
    if (!chapter) return;
    await requireBoard(ctx, chapter.boardId);
    await ctx.db.patch(chapterId, {
      title: title.trim() || "Untitled Chapter",
    });
  },
});

export const deleteChapter = mutation({
  args: { chapterId: v.id("chapters") },
  handler: async (ctx, { chapterId }) => {
    const chapter = await ctx.db.get(chapterId);
    if (!chapter) return;
    const board = await requireBoard(ctx, chapter.boardId);

    const siblings = await ctx.db
      .query("chapters")
      .withIndex("by_board", (q) => q.eq("boardId", board._id))
      .collect();
    if (siblings.length <= 1) throw new Error("A book needs at least one row");

    const cells = await ctx.db
      .query("cells")
      .withIndex("by_chapter_column", (q) => q.eq("chapterId", chapterId))
      .collect();
    for (const cell of cells) await ctx.db.delete(cell._id);
    await ctx.db.delete(chapterId);
    await renumber(ctx, board._id, "chapters");
  },
});

// ---------------------------------------------------------------------------
// Plot columns
// ---------------------------------------------------------------------------

export const insertColumn = mutation({
  args: {
    boardId: v.id("boards"),
    index: v.optional(v.number()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { boardId, index, title }) => {
    await requireBoard(ctx, boardId);
    const existing = await ctx.db
      .query("plotColumns")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    existing.sort((a, b) => a.order - b.order);

    const at = Math.max(0, Math.min(index ?? existing.length, existing.length));
    const newId = await ctx.db.insert("plotColumns", {
      boardId,
      title: title?.trim() || `Column ${existing.length + 1}`,
      order: at,
    });
    for (let i = at; i < existing.length; i++) {
      await ctx.db.patch(existing[i]._id, { order: i + 1 });
    }
    await ctx.db.patch(newId, { order: at });
    await renumber(ctx, boardId, "plotColumns");
    return newId;
  },
});

export const renameColumn = mutation({
  args: { columnId: v.id("plotColumns"), title: v.string() },
  handler: async (ctx, { columnId, title }) => {
    const column = await ctx.db.get(columnId);
    if (!column) return;
    await requireBoard(ctx, column.boardId);
    await ctx.db.patch(columnId, { title: title.trim() || "Untitled Column" });
  },
});

export const deleteColumn = mutation({
  args: { columnId: v.id("plotColumns") },
  handler: async (ctx, { columnId }) => {
    const column = await ctx.db.get(columnId);
    if (!column) return;
    const board = await requireBoard(ctx, column.boardId);

    const siblings = await ctx.db
      .query("plotColumns")
      .withIndex("by_board", (q) => q.eq("boardId", board._id))
      .collect();
    if (siblings.length <= 1) throw new Error("Keep at least one column");

    const cells = await ctx.db
      .query("cells")
      .withIndex("by_board", (q) => q.eq("boardId", board._id))
      .collect();
    for (const cell of cells) {
      if (cell.columnId === columnId) await ctx.db.delete(cell._id);
    }
    await ctx.db.delete(columnId);
    await renumber(ctx, board._id, "plotColumns");
  },
});

// ---------------------------------------------------------------------------
// Cells (cards)
// ---------------------------------------------------------------------------

/** Upsert one card's text. Empty text deletes the card document. */
export const setCell = mutation({
  args: {
    boardId: v.id("boards"),
    chapterId: v.id("chapters"),
    columnId: v.id("plotColumns"),
    content: v.string(),
  },
  handler: async (ctx, { boardId, chapterId, columnId, content }) => {
    await requireBoard(ctx, boardId);
    const existing = await ctx.db
      .query("cells")
      .withIndex("by_chapter_column", (q) =>
        q.eq("chapterId", chapterId).eq("columnId", columnId),
      )
      .unique();

    const text = content.trim();
    if (!text) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    if (existing) {
      await ctx.db.patch(existing._id, { content: text });
    } else {
      await ctx.db.insert("cells", {
        boardId,
        chapterId,
        columnId,
        content: text,
      });
    }
  },
});

/**
 * Drag-and-drop: move a card from one grid position to another.
 * If the target already holds a card, the two swap places so no writing
 * is ever silently destroyed.
 */
export const moveCell = mutation({
  args: {
    boardId: v.id("boards"),
    fromChapterId: v.id("chapters"),
    fromColumnId: v.id("plotColumns"),
    toChapterId: v.id("chapters"),
    toColumnId: v.id("plotColumns"),
  },
  handler: async (ctx, args) => {
    await requireBoard(ctx, args.boardId);
    const { fromChapterId, fromColumnId, toChapterId, toColumnId, boardId } =
      args;
    if (fromChapterId === toChapterId && fromColumnId === toColumnId) return;

    const [source, target] = await Promise.all([
      ctx.db
        .query("cells")
        .withIndex("by_chapter_column", (q) =>
          q.eq("chapterId", fromChapterId).eq("columnId", fromColumnId),
        )
        .unique(),
      ctx.db
        .query("cells")
        .withIndex("by_chapter_column", (q) =>
          q.eq("chapterId", toChapterId).eq("columnId", toColumnId),
        )
        .unique(),
    ]);
    if (!source) return; // nothing to move

    const sourceText = source.content;
    const targetText = target?.content ?? "";

    if (target) {
      await ctx.db.patch(target._id, { content: sourceText });
      if (targetText.trim()) {
        await ctx.db.patch(source._id, { content: targetText });
      } else {
        await ctx.db.delete(source._id);
      }
    } else {
      await ctx.db.patch(source._id, {
        chapterId: toChapterId,
        columnId: toColumnId,
        boardId,
      });
    }
  },
});
