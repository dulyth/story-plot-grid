// SSR/DOM smoke-test mock: returns a fixed board for any query, and records
// every mutation call on globalThis.__MUTATION_CALLS for assertions.
export function useQuery() {
  return (globalThis as Record<string, unknown>).__QUERY_RESULT ?? null;
}
export function useMutation() {
  return async (args?: Record<string, unknown>) => {
    const calls = ((globalThis as Record<string, unknown>).__MUTATION_CALLS ??= []) as Array<
      Record<string, unknown>
    >;
    // Record by arg shape only — stringifying the api proxy throws.
    calls.push({ ...(args ?? {}) });
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
