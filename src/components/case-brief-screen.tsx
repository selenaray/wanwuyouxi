import type { PlayerCase } from "@/features/game/types";

export function CaseBriefScreen({ game, onEnter }: { game: PlayerCase; onEnter: () => void }) {
  return (
    <div className="screen briefing-screen">
      <div className="case-number"><span>{game.caseNumber}</span><span>轻悬疑 · 约 3 分钟</span></div>
      <div className="briefing-art" aria-hidden="true"><span className="briefing-number">00:00</span><span className="briefing-seal">CONFIDENTIAL</span></div>
      <div className="briefing-copy">
        <p className="eyebrow">MISSING PERSON</p>
        <h1>{game.title}</h1>
        <p>{game.background}</p>
      </div>
      <div className="objective-card"><span className="objective-icon">⌖</span><div><small>你的任务</small><strong>{game.objective}</strong></div></div>
      <button className="primary-button" type="button" onClick={onEnter}>进入现场 <span aria-hidden="true">↗</span></button>
    </div>
  );
}
