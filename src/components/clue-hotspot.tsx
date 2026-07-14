import type { GameClue } from "@/features/game/types";

type Props = { clue: GameClue; collected: boolean; onOpen: () => void };

export function ClueHotspot({ clue, collected, onOpen }: Props) {
  return (
    <button
      className={`clue-hotspot ${collected ? "collected" : ""}`}
      style={{ left: `${clue.x <= 1 ? clue.x * 100 : clue.x}%`, top: `${clue.y <= 1 ? clue.y * 100 : clue.y}%` }}
      type="button"
      onClick={onOpen}
      aria-label={`查看${clue.objectName}`}
    >
      <span className="hotspot-ring" /><span className="hotspot-dot">{collected ? "✓" : ""}</span>
    </button>
  );
}
