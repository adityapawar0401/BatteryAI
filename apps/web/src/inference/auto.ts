import type { CurveRow, InferenceProvider, InferenceResponse } from "../types";

export class AutoInferenceProvider {
  constructor(private browser: InferenceProvider, private local: InferenceProvider, private localIsPaired: boolean) {}
  async infer(rows: CurveRow[], signal?: AbortSignal): Promise<InferenceResponse> {
    const browserCapability = await this.browser.capability(signal);
    if (browserCapability.available) {
      try { return await this.browser.infer(rows, signal); } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
        /* A verified browser load failure permits paired-local fallback. */
      }
    }
    if (!this.localIsPaired) throw new Error("Browser ML is unavailable. Pair the local engine before Auto can send battery data to it.");
    const localCapability = await this.local.capability(signal);
    if (!localCapability.available) throw new Error(localCapability.reason ?? "The paired local engine is unavailable.");
    return this.local.infer(rows, signal);
  }
}
