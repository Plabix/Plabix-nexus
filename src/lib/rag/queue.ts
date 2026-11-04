import { query } from "@/lib/db/pool";
import { processDocument } from "./ingest";

/**
 * In-process background queue for document ingestion.
 *
 * Uploads return immediately; documents are processed here with bounded
 * concurrency so a burst of uploads can't saturate Ollama or block requests.
 * State lives on globalThis so dev-mode hot reloads don't create duplicate
 * workers. This assumes one app instance; for several instances, move to a
 * Postgres-backed queue (SELECT … FOR UPDATE SKIP LOCKED) with the same API.
 */
interface QueueState {
  queued: string[];
  inFlight: Set<string>;
  active: number;
  sweepTimer: ReturnType<typeof setInterval> | null;
}

const globalForQueue = globalThis as typeof globalThis & { __plabixIngestQueue?: QueueState };
const state: QueueState = (globalForQueue.__plabixIngestQueue ??= {
  queued: [],
  inFlight: new Set(),
  active: 0,
  sweepTimer: null,
});

function concurrency(): number {
  const value = Number(process.env.INGESTION_CONCURRENCY || 1);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

/** Minutes after which a 'processing' document is assumed abandoned. */
function staleMinutes(): number {
  const value = Number(process.env.INGESTION_STALE_MINUTES || 30);
  return Number.isFinite(value) && value > 0 ? value : 30;
}

export function enqueueDocument(documentId: string): void {
  if (state.inFlight.has(documentId)) return;
  state.inFlight.add(documentId);
  state.queued.push(documentId);
  drain();
}

export function queueStats() {
  return { queued: state.queued.length, active: state.active };
}

function drain(): void {
  while (state.active < concurrency() && state.queued.length > 0) {
    const documentId = state.queued.shift()!;
    state.active += 1;
    processDocument(documentId)
      .catch((err) => {
        // The failure is recorded on the document row; log without content.
        console.error(
          `[ingest] document ${documentId} failed:`,
          err instanceof Error ? err.message : err
        );
      })
      .finally(() => {
        state.active -= 1;
        state.inFlight.delete(documentId);
        drain();
      });
  }
}

/**
 * Re-queues work that would otherwise be stuck: documents left 'processing'
 * by a crash/restart, and 'pending' documents created outside the app (seed
 * script) or never picked up.
 */
export async function recoverDocuments({ onStartup = false } = {}): Promise<number> {
  await query(
    onStartup
      ? // Nothing can be mid-processing in a process that just started.
        `UPDATE documents SET status = 'pending' WHERE status = 'processing'`
      : `UPDATE documents SET status = 'pending'
         WHERE status = 'processing'
           AND processing_started_at < now() - make_interval(mins => $1)`,
    onStartup ? [] : [staleMinutes()]
  );
  const pending = await query<{ id: string }>(
    "SELECT id FROM documents WHERE status = 'pending' ORDER BY created_at ASC LIMIT 500"
  );
  for (const row of pending) enqueueDocument(row.id);
  return pending.length;
}

/** Starts recovery on boot and a periodic sweep. Safe to call more than once. */
export function startIngestionWorker(): void {
  if (state.sweepTimer) return;
  recoverDocuments({ onStartup: true })
    .then((count) => {
      if (count > 0) console.log(`[ingest] queued ${count} pending document(s)`);
    })
    .catch((err) => {
      console.error("[ingest] startup recovery failed:", err instanceof Error ? err.message : err);
    });
  state.sweepTimer = setInterval(() => {
    recoverDocuments().catch(() => {
      // Database may be briefly unavailable; the next sweep retries.
    });
  }, 60_000);
  state.sweepTimer.unref?.();
}
