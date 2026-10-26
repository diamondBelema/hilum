import { EmptyState } from "../components/ui.tsx";

export function ProgressScreen() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Progress</h1>
      <div className="mt-6">
        <EmptyState title="Nothing to show yet">
          Mastery is built from graded practice and live sessions. Finish one session to see topics,
          weak spots and review dates here.
        </EmptyState>
      </div>
    </div>
  );
}

