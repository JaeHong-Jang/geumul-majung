import "@testing-library/jest-dom/vitest";

// jsdom has no layout observer; Leaflet still exercises its lifecycle in tests.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
