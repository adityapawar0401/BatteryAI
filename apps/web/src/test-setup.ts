import "@testing-library/jest-dom/vitest";

/*
 * jsdom implements no canvas backend and no matchMedia. The decorative landing
 * backdrop and pointer halo must degrade to nothing rather than emit jsdom
 * errors, which the Windows verification scripts treat as a failure.
 */
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
