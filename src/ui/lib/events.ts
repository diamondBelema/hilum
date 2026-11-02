export type HarnessEvent =
  | { type: "hello"; at: number }
  | { type: "submitted"; course: string; attemptId: string; at: number }
  | { type: "graded"; course: string; attemptId: string; answerId: number; at: number }
  | { type: "activity"; course: string; sessionId: string; activityId: string; state: string; at: number }
  | { type: "session"; course: string; sessionId: string; state: string; at: number }
  | { type: "goal" | "plan" | "task"; course: string; goalId?: string; taskId?: string; state: string; at: number };

const listeners = new Set<(event: HarnessEvent) => void>();
let source: EventSource | null = null;

function ensureSource(): void {
  if (source || typeof window === "undefined") return;
  source = new EventSource("/api/events");
  source.onmessage = (message) => {
    let event: HarnessEvent;
    try {
      event = JSON.parse(message.data) as HarnessEvent;
    } catch {
      return;
    }
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // one subscriber must not stop the others
      }
    }
  };
}

export function subscribeHarnessEvents(listener: (event: HarnessEvent) => void): () => void {
  listeners.add(listener);
  ensureSource();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && source) {
      source.close();
      source = null;
    }
  };
}
