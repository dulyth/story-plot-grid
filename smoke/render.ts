/**
 * SSR smoke render: loads the real page modules through the project's Vite
 * pipeline (so aliases, TSX and SVG imports resolve exactly as in the dev
 * server) and server-renders each screen. Any render-time crash fails the run.
 */
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { createElement } from "react";

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

// Load react-router through the same Vite pipeline as the pages so the
// Router context is a single shared instance (importing it from Node directly
// gives a second copy and useNavigate() throws).
const { MemoryRouter } = await server.ssrLoadModule("react-router");

// Board fixture so Dashboard/PlotGrid render their populated path.
(globalThis as Record<string, unknown>).__QUERY_RESULT = {
  boardId: "board1",
  title: "Untitled Novel",
  chapters: [
    { id: "ch1", title: "Chapter 1" },
    { id: "ch2", title: "Chapter 2" },
  ],
  columns: [
    { id: "col1", title: "Plot Point" },
    { id: "col2", title: "Physical Layer" },
    { id: "col3", title: "Invisible Layer" },
    { id: "col4", title: "Theme" },
  ],
  cells: { "ch1:col1": "The letter arrives sealed in black wax.", "ch1:col2": "" },
};

const cases = [
  { mod: "/src/pages/Landing.tsx", route: "/" },
  { mod: "/src/pages/NotFound.tsx", route: "/nope" },
  { mod: "/src/pages/Auth.tsx", route: "/auth" },
  { mod: "/src/pages/Dashboard.tsx", route: "/dashboard" },
  { mod: "/src/components/plot/PlotGrid.tsx", route: "/dashboard" },
  { mod: "/src/components/plot/CellEditor.tsx", route: "/dashboard" },
];

let failed = 0;
for (const testCase of cases) {
  try {
    const mod = await server.ssrLoadModule(testCase.mod);
    const Page = mod.default ?? mod.PlotGrid ?? mod.CellEditor;
    const extraProps =
      testCase.mod.includes("PlotGrid") ? { data: (globalThis as Record<string, unknown>).__QUERY_RESULT } :
      testCase.mod.includes("CellEditor") ? { open: true, onOpenChange: () => {}, chapterTitle: "Chapter 1", columnTitle: "Plot Point", value: "seed text", onSave: () => {} } :
      {};
    const html = renderToString(
      createElement(MemoryRouter, { initialEntries: [testCase.route] }, createElement(Page, extraProps)),
    );
    if (html.length < 20) throw new Error(`suspiciously short output (${html.length} chars)`);
    console.log(`OK   ${testCase.mod}  (${html.length} chars)`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${testCase.mod}`);
    console.error(error);
  }
}

await server.close();
console.log(failed === 0 ? "SMOKE PASS" : `SMOKE FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
