import type { GameClue } from "@/features/game/types";

export function ClueSheet({ clue, onClose }: { clue: GameClue; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" role="presentation">
      <section className="clue-sheet" role="dialog" aria-modal="true" aria-labelledby="clue-title">
        <div className="sheet-handle" />
        <p className="eyebrow">EVIDENCE FOUND</p>
        <h2 id="clue-title">{clue.objectName}</h2>
        <p>{clue.clueText}</p>
        <div className="evidence-tag"><span>现场证物</span><span>已录入档案</span></div>
        <button className="secondary-button" type="button" onClick={onClose}>收起线索</button>
      </section>
    </div>
  );
}
