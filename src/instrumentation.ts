/** Runs once when the server starts (Next.js instrumentation hook). */
export async function register() {
  // Node server only, and not while `next build` collects pages (no database there).
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startCleanup } = await import("./server/cleanup");
    startCleanup();
  }
}
