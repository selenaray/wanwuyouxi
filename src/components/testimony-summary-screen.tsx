import type { V2PlayerCase } from "@/features/game/types";

type Props = {
  game: V2PlayerCase;
  selectedAnswerIndex: number | null;
  showHint: boolean;
  busy: boolean;
  onSelect: (index: number) => void;
  onSubmit: () => void;
  onBack: () => void;
};

export function TestimonySummaryScreen({ game, selectedAnswerIndex, showHint, busy, onSelect, onSubmit, onBack }: Props) {
  return (
    <div className="screen deduction-screen testimony-summary-screen">
      <header className="top-bar"><span className="eyebrow">TESTIMONY FILES</span><span className="step-label">03 / 03</span></header>
      <div className="deduction-copy">
        <span className="deduction-mark">≠</span>
        <p className="eyebrow">三份证词已归档</p>
        <h1>哪句话与现场物证矛盾？</h1>
        <p>对照人物证词与刚才发现的物证，选择唯一存在矛盾的一份证词。</p>
      </div>
      {showHint && <div className="hint-card"><span>提示</span><p>{game.wrongAnswerHint}</p></div>}
      <div className="answer-list testimony-list" role="radiogroup" aria-label="选择矛盾证词">
        {game.suspects.map((suspect, index) => (
          <label className={`answer-option testimony-option ${selectedAnswerIndex === index ? "selected" : ""}`} key={suspect.id}>
            <input type="radio" name="testimony" checked={selectedAnswerIndex === index} onChange={() => onSelect(index)} />
            <span className="answer-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
            <span><strong>{suspect.name} · {suspect.identity}</strong><small>{suspect.initialTestimony}</small></span>
            <span className="answer-radio" />
          </label>
        ))}
      </div>
      <button className="primary-button" type="button" disabled={selectedAnswerIndex === null || busy} onClick={onSubmit}>{busy ? "提交中…" : "提交推理"} <span aria-hidden="true">↗</span></button>
      <button className="secondary-button" type="button" onClick={onBack}>返回现场</button>
    </div>
  );
}
