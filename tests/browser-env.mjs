// Match the browser runtime for pure-module regression tests. VM fixtures create
// their own window; no production code falls back to a Node global.
globalThis.window=globalThis;
