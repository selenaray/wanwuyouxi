import type { V2PlayerCase } from "@/features/game/types";

type Props = {
  game: V2PlayerCase;
  onBack: () => void;
};

export function TestimonySummaryScreen({ game, onBack }: Props) {
  return (
    <div className="screen deduction-screen testimony-summary-screen">
      <header className="top-bar"><span className="eyebrow">TESTIMONY FILES</span><span className="step-label">03 / 03</span></header>
      <div className="deduction-copy">
        <span className="deduction-mark">≠</span>
        <p className="eyebrow">三份证词已归档</p>
        <h1>哪句话与现场物证矛盾？</h1>
        <p>对照人物证词与刚才发现的物证。有限自由审问将在下一阶段开放。</p>
      </div>
      <div className="testimony-list">
        {game.suspects.map((suspect) => (
          <article className="hint-card" key={suspect.id}>
            <span>{suspect.name} · {suspect.identity}</span>
            <p>{suspect.initialTestimony}</p>
          </article>
        ))}
      </div>
      <button className="secondary-button" type="button" onClick={onBack}>返回现场</button>
    </div>
  );
}
