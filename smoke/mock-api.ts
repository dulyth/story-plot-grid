// SSR/DOM smoke-test mock: api paths resolve to dotted strings so mocks can
// tell which function was referenced (e.g. "plot.claimBoard").
const make = (path: string): unknown =>
  new Proxy(
    {},
    {
      get: (_target, prop) =>
        typeof prop === "symbol"
          ? undefined
          : make(path ? `${path}.${String(prop)}` : String(prop)),
    },
  );

export const api = make("");
export default { api };
