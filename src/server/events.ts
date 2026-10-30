export type HarnessEvent =
  | { type: "submitted"; course: string; attemptId: string; at: number }
  | { type: "graded"; course: string; attemptId: string; answerId: number; at: number }
  | { type: "activity"; course: string; sessionId: string; activityId: string; state: string; at: number }
  | { type: "session"; course: string; sessionId: string; state: string; at: number }
  | {
      type: "agent";
      state: string;
      clientName: string | null;
      lastSeenAt: number | null;
      at: number;
    };

export class EventBus {
  private readonly listeners = new Set<(event: HarnessEvent) => void>();

  publish(event: HarnessEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken subscriber must not block the write that produced the event.
      }
    }
  }

  subscribe(listener: (event: HarnessEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
