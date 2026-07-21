import type { GameClue, GameEvidence } from "@/features/game/types";

type Props = { clue: GameClue | GameEvidence; collected: boolean; onOpen: () => void; evidence?: boolean };

export function ClueHotspot({ clue, collected, onOpen, evidence = false }: Props) {
  return (
    <button
      className={`clue-hotspot ${collected ? "collected" : ""}`}
      style={{ left: `${clue.x <= 1 ? clue.x * 100 : clue.x}%`, top: `${clue.y <= 1 ? clue.y * 100 : clue.y}%` }}
      type="button"
      onClick={onOpen}
      aria-label={`查看${clue.objectName}${evidence ? "物证" : ""}`}
    >
      <span className="hotspot-ring" /><span className="hotspot-dot">{collected ? "✓" : ""}</span>
    </button>
  );
}
