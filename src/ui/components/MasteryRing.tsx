export type MasteryState = "unseen" | "familiar" | "understood" | "mastered" | "decayed";

const labels: Record<MasteryState, string> = {
  unseen: "Not seen",
  familiar: "Familiar",
  understood: "Understood",
  mastered: "Mastered",
  decayed: "Due for review",
};

const filled: Record<MasteryState, number> = {
  unseen: 0,
  familiar: 1,
  understood: 2,
  mastered: 3,
  decayed: 2,
};

export function MasteryRing({
  state,
  size = 24,
  label,
}: {
  state: MasteryState;
  size?: number;
  label?: string;
}) {
  const name = label ?? labels[state];
  const stroke = size >= 40 ? 3 : size >= 24 ? 3.5 : 5;
  const radius = 20 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = state === "mastered" ? 0 : 3;
  const arc = state === "mastered" ? circumference : (circumference - gap * 3) / 3;
  const shown = filled[state];
  const mastered = state === "mastered";

  return (
    <span
      role="img"
      aria-label={`${name}${state === "decayed" ? ", review due" : ""}`}
      title={name}
      className={`inline-flex shrink-0 items-center justify-center ${
        state === "decayed" ? "text-warning" : "text-primary"
      }`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.28}
          strokeWidth={stroke / 2}
          strokeDasharray={state === "decayed" ? "2 3" : undefined}
        />
        {mastered ? (
          <>
            <circle cx="20" cy="20" r={radius} fill="currentColor" fillOpacity={0.18} />
            <path
              d="M12.5 20.5l5 5 10-11"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          Array.from({ length: shown }).map((_, index) => (
            <circle
              key={index}
              cx="20"
              cy="20"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arc} ${circumference - arc}`}
              strokeDashoffset={-index * (arc + gap)}
              transform="rotate(-90 20 20)"
            />
          ))
        )}
      </svg>
    </span>
  );
}
