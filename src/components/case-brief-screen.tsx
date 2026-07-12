import { MOCK_CASE } from "@/features/game/mock-case";

export function CaseBriefScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="screen briefing-screen">
      <div className="case-number"><span>{MOCK_CASE.caseNumber}</span><span>轻悬疑 · 约 3 分钟</span></div>
      <div className="briefing-art" aria-hidden="true"><span className="briefing-number">00:00</span><span className="briefing-seal">CONFIDENTIAL</span></div>
      <div className="briefing-copy">
        <p className="eyebrow">MISSING PERSON</p>
        <h1>{MOCK_CASE.title}</h1>
        <p>{MOCK_CASE.background}</p>
      </div>
      <div className="objective-card"><span className="objective-icon">⌖</span><div><small>你的任务</small><strong>{MOCK_CASE.objective}</strong></div></div>
      <button className="primary-button" type="button" onClick={onEnter}>进入现场 <span aria-hidden="true">↗</span></button>
    </div>
  );
}
