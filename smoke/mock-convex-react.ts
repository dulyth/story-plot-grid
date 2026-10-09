// SSR/DOM smoke-test mock: returns a fixed board for any query, records every
// mutation call on globalThis.__MUTATION_CALLS, and fakes per-function
// return values where the app depends on them.
export function useQuery() {
  return (globalThis as Record<string, unknown>).__QUERY_RESULT ?? null;
}

export function useMutation(api: unknown) {
  const name = typeof api === "string" ? api : "";
  return async (args?: Record<string, unknown>) => {
    const g = globalThis as Record<string, unknown>;
    const calls = (g.__MUTATION_CALLS ??= []) as Array<Record<string, unknown>>;
    calls.push({ fn: name, ...(args ?? {}) });

    // Opt-in failure injection for retry-path tests.
    const failing = g.__MUTATION_FAIL;
    if (typeof failing === "string" && name.endsWith(failing)) {
      throw new Error(`injected failure: ${name}`);
    }

    if (name.endsWith("claimBoard")) {
      // A claim only succeeds when a marker id was offered.
      return args?.boardId ?? null;
    }
    if (name.endsWith("addCard")) return "newCardId";
    return undefined;
  };
}

export function useConvexAuth() {
  return { isLoading: false, isAuthenticated: true };
}
export function useConvexClient() {
  return {};
}
export function ConvexReactClient() {
  return {};
}
