import type { MockClue } from "@/features/game/types";

type Props = { clue: MockClue; collected: boolean; onOpen: () => void };

export function ClueHotspot({ clue, collected, onOpen }: Props) {
  return (
    <button
      className={`clue-hotspot ${collected ? "collected" : ""}`}
      style={{ left: `${clue.x}%`, top: `${clue.y}%` }}
      type="button"
      onClick={onOpen}
      aria-label={`查看${clue.objectName}`}
    >
      <span className="hotspot-ring" /><span className="hotspot-dot">{collected ? "✓" : ""}</span>
    </button>
  );
}
