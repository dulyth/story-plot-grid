// SSR smoke-test mock for @/convex/_generated/api: any path resolves.
const proxied: unknown = new Proxy(
  {},
  { get: (_target, prop) => (typeof prop === "symbol" ? undefined : proxied) },
);
export const api = proxied;
export default { api };
