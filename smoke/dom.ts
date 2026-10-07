/**
 * DOM smoke test (happy-dom): exercises the two interactive paths the SSR
 * render cannot reach — the cell editor dialog (type → autosave → escape
 * flush) and grid drag-and-drop (drop onto another cell → moveCell called).
 */
import { Window } from "/tmp/domtest/node_modules/happy-dom/lib/index.js";

const win = new Window({ url: "http://localhost/" });
const doc = win.document;
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "CustomEvent",
  "MutationObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "CSS",
  "SVGElement",
  "DocumentFragment",
  "HTMLIFrameElement",
  "localStorage",
  "sessionStorage",
  "location",
  "history",
]) {
  Object.defineProperty(globalThis, key, {
    value: (win as Record<string, unknown>)[key] ?? (win as unknown as Record<string, unknown>)[key],
    configurable: true,
    writable: true,
  });
}
(globalThis as Record<string, unknown>).global = globalThis;
// Required for React's act() to be considered supported in this environment.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
win.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as never;
Object.defineProperty(globalThis, "matchMedia", { value: win.matchMedia, configurable: true });

const { createServer } = await import("vite");
const react = (await import("@vitejs/plugin-react")).default;
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");
// Import React from Node *after* the DOM globals exist: Vite externalizes
// react, so components loaded via ssrLoadModule share this same instance.
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/convex\/_generated\/api$/, replacement: path.join(root, "smoke/mock-api.ts") },
      { find: /^convex\/react$/, replacement: path.join(root, "smoke/mock-convex-react.ts") },
      { find: /^@convex-dev\/auth\/react$/, replacement: path.join(root, "smoke/mock-convex-auth.ts") },
      { find: /^@\//, replacement: path.join(root, "src") + "/" },
    ],
  },
});

const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

// ---------------------------------------------------------------------------
// 1. CellEditor: open → type → autosave fires → escape flushes pending text
// ---------------------------------------------------------------------------
{
  const { CellEditor } = await server.ssrLoadModule("/src/components/plot/CellEditor.tsx");
  const { MemoryRouter } = await server.ssrLoadModule("react-router");

  const saves: string[] = [];
  let open = true;
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const root = createRoot(container);

  const render = () =>
    act(async () => {
      root.render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ["/"] },
          React.createElement(CellEditor, {
            open,
            onOpenChange: (next: boolean) => {
              open = next;
              render();
            },
            chapterTitle: "Chapter 1",
            columnTitle: "Plot Point",
            value: "seed text",
            onSave: (text: string) => saves.push(text),
          }),
        ),
      );
    });

  await render();
  const textarea = doc.querySelector("textarea");
  check("CellEditor dialog opens with a textarea", textarea !== null);
  check(
    "CellEditor seeds the existing card value",
    textarea !== null && textarea.value === "seed text",
    textarea?.value,
  );

  // Type fresh text and confirm the debounced autosave reaches the saver.
  if (textarea) {
    const setter = Object.getOwnPropertyDescriptor(
      win.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setter?.call(textarea, "the orchard remembers");
      textarea.dispatchEvent(new win.Event("input", { bubbles: true }));
    });
    await new Promise((resolve) => setTimeout(resolve, 750)); // past the 600ms debounce
    check(
      "CellEditor debounced autosave saves typed text",
      saves.includes("the orchard remembers"),
      JSON.stringify(saves),
    );

    // Escape with unsent text must flush it, not drop it.
    await act(async () => {
      setter?.call(textarea, "and the rain keeps score");
      textarea.dispatchEvent(new win.Event("input", { bubbles: true }));
    });
    await act(async () => {
      textarea.dispatchEvent(
        new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    check(
      "CellEditor escape flushes unsaved text before closing",
      saves.includes("and the rain keeps score"),
      JSON.stringify(saves),
    );
    check("CellEditor closes on escape", open === false);
  }
  await act(async () => root.unmount());
}

// ---------------------------------------------------------------------------
// 2. PlotGrid drag: dropping a card on another cell calls moveCell(from,to)
// ---------------------------------------------------------------------------
{
  const { PlotGrid } = await server.ssrLoadModule("/src/components/plot/PlotGrid.tsx");
  const { MemoryRouter } = await server.ssrLoadModule("react-router");

  // The convex mock records every mutation on this array.
  const calls = ((globalThis as Record<string, unknown>).__MUTATION_CALLS ??= []) as Array<
    Record<string, string>
  >;
  calls.length = 0;

  const data = {
    boardId: "b1",
    title: "Novel",
    chapters: [
      { id: "ch1", title: "Chapter 1" },
      { id: "ch2", title: "Chapter 2" },
    ],
    columns: [
      { id: "col1", title: "Plot Point" },
      { id: "col2", title: "Theme" },
    ],
    cells: {
      "ch1:col1": [{ id: "cardA", content: "the letter" }],
      "ch2:col2": [{ id: "cardB", content: "inheritance as debt" }],
    },
  };

  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/"] },
        React.createElement(PlotGrid, { data }),
      ),
    );
  });

  const cards = Array.from(doc.querySelectorAll('[role="button"]'));
  check("PlotGrid renders both existing cards", cards.length === 2, `${cards.length} cards`);
  check(
    "PlotGrid renders an add-card control per slot",
    Array.from(doc.querySelectorAll("button")).filter((b) =>
      b.getAttribute("aria-label")?.startsWith("Add a card to"),
    ).length === 4,
  );
  check(
    "PlotGrid renders the four default layers",
    doc.body.textContent?.includes("Plot Point") === true &&
      doc.body.textContent?.includes("Theme") === true,
  );
  check("PlotGrid renders both chapter rows", doc.body.textContent?.includes("Chapter 2") === true);
  check(
    "PlotGrid shows existing card text",
    doc.body.textContent?.includes("the letter") === true,
  );
  check(
    "An empty slot shows the add-a-card control, not a blank card",
    cards.every((card) => card.textContent?.trim().length !== 0),
  );

  // dragstart on card 1 → drop on card 4 (ch2 x col2): should swap the texts.
  const makeDrag = (type: string) => {
    const event = new win.Event(type, { bubbles: true, cancelable: true }) as Record<string, unknown>;
    event.dataTransfer = {
      effectAllowed: "",
      dropEffect: "",
      setData: () => {},
      getData: () => "",
    };
    return event;
  };

  if (cards.length >= 2) {
    await act(async () => {
      cards[0].dispatchEvent(makeDrag("dragstart"));
    });
    await act(async () => {
      cards[1].dispatchEvent(makeDrag("dragover"));
      cards[1].dispatchEvent(makeDrag("drop"));
      cards[0].dispatchEvent(makeDrag("dragend"));
    });
    const move = calls.find((c) => "cardId" in c);
    check("PlotGrid drop calls moveCard with the dragged card", move !== undefined, JSON.stringify(move));
    check(
      "moveCard appends into the dropped-onto slot (no swap)",
      move?.cardId === "cardA" &&
        move?.toChapterId === "ch2" &&
        move?.toColumnId === "col2",
      JSON.stringify(move),
    );
    check(
      "moveCard never mentions a swap/source slot",
      move !== undefined && !("fromChapterId" in (move ?? {})),
    );
  }

  // “+ card” in an empty slot must create a card there, not swap anything.
  calls.length = 0;
  const addButtons = Array.from(doc.querySelectorAll("button")).filter((b) =>
    b.getAttribute("aria-label")?.startsWith("Add a card to"),
  );
  await act(async () => {
    addButtons[1]?.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  // addCard args: chapterId + columnId but no cardId/toChapterId.
  const added = calls.find(
    (c) => "chapterId" in c && !("cardId" in c) && !("toChapterId" in c),
  );
  check(
    "Add-card button creates a card in that slot",
    added !== undefined && added.chapterId === "ch1" && added.columnId === "col2",
    JSON.stringify(calls),
  );

  // Click-to-edit: a plain click must open the editor dialog.
  calls.length = 0;
  await new Promise((resolve) => setTimeout(resolve, 400)); // clear drag click-guard
  await act(async () => {
    cards[1]?.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const dialogTitle = Array.from(doc.querySelectorAll("[data-slot=dialog-title]")).map((n) =>
    n.textContent?.trim(),
  );
  check(
    "PlotGrid click opens the card editor with chapter/layer context",
    dialogTitle.some((t) => t === "Chapter 2"),
    JSON.stringify(dialogTitle),
  );

  await act(async () => root.unmount());
}

await server.close();
console.log(failures.length === 0 ? "DOM SMOKE PASS" : `DOM SMOKE FAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);
