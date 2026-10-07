// SSR smoke-test mock for @convex-dev/auth/react.
export function useAuthActions() {
  return { signIn: async () => undefined, signOut: async () => undefined };
}
export function ConvexAuthProvider({ children }: { children?: unknown }) {
  return children;
}
