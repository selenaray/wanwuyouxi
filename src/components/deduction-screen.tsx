import { MOCK_CASE } from "@/features/game/mock-case";

type Props = {
  selectedAnswerIndex: number | null;
  showHint: boolean;
  onSelect: (index: number) => void;
  onSubmit: () => void;
};

export function DeductionScreen({ selectedAnswerIndex, showHint, onSelect, onSubmit }: Props) {
  return (
    <div className="screen deduction-screen">
      <header className="top-bar"><span className="eyebrow">FINAL DEDUCTION</span><span className="step-label">03 / 03</span></header>
      <div className="deduction-copy">
        <span className="deduction-mark">?</span>
        <p className="eyebrow">所有线索已收集</p>
        <h1>{MOCK_CASE.question}</h1>
        <p>三个物品指向同一个答案。选择之后，你还有一次修正机会。</p>
      </div>
      {showHint && <div className="hint-card"><span>提示</span><p>{MOCK_CASE.wrongAnswerHint}</p></div>}
      <div className="answer-list" role="radiogroup" aria-label="选择你的推理结论">
        {MOCK_CASE.answerOptions.map((option, index) => (
          <label key={option} className={`answer-option ${selectedAnswerIndex === index ? "selected" : ""}`}>
            <input type="radio" name="answer" checked={selectedAnswerIndex === index} onChange={() => onSelect(index)} />
            <span className="answer-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
            <strong>{option}</strong><span className="answer-radio" />
          </label>
        ))}
      </div>
      <button className="primary-button" type="button" disabled={selectedAnswerIndex === null} onClick={onSubmit}>提交推理 <span aria-hidden="true">↗</span></button>
    </div>
  );
}
