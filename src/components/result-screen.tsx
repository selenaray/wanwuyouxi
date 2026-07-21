import type { PlayerCase } from "@/features/game/types";

type Props = { game: PlayerCase; truth: string; firstAnswerCorrect: boolean | null; elapsedSeconds: number; onReplay: () => void };

export function ResultScreen({ game, truth, firstAnswerCorrect, elapsedSeconds, onReplay }: Props) {
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");

  return (
    <div className="screen result-screen">
      <div className="result-glow" />
      <div className="result-stamp"><span>CASE</span><strong>CLOSED</strong></div>
      <p className="eyebrow">THE TRUTH HAS SURFACED</p>
      <h1>案件已解开</h1>
      <p className="result-subtitle">{firstAnswerCorrect ? "你一次就找到了隐藏的去向" : "真相总会在第二次审视中浮现"}</p>
      <article className="truth-card">
        <span className="truth-label">真相档案 · {game.caseNumber}</span>
        <h2>{game.title}</h2>
        <p>{truth}</p>
      </article>
      <div className="result-metrics">
        <div><span>破解用时</span><strong>{minutes}:{seconds}</strong></div>
        <div><span>现场线索</span><strong>03 / 03</strong></div>
        <div><span>推理评级</span><strong>{firstAnswerCorrect ? "S" : "A"}</strong></div>
      </div>
      <div className="action-stack compact">
        <button className="primary-button" type="button" onClick={onReplay}>再拍一个现场 <span aria-hidden="true">↗</span></button>
        <button className="secondary-button" type="button" onClick={() => window.print()}>保存案件卡</button>
      </div>
    </div>
  );
}
