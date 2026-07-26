import type { PlayerCase } from "@/features/game/types";

type Props = {
  game: PlayerCase;
  truth: string;
  firstAnswerCorrect: boolean | null;
  elapsedSeconds: number;
  comicStatus: "idle" | "loading" | "success" | "error";
  comicImageUrl: string | null;
  comicPanels: { title: string; description: string }[] | null;
  comicErrorCode: string | null;
  onGenerateComic: () => void;
  onReplay: () => void;
};

export function ResultScreen({
  game,
  truth,
  firstAnswerCorrect,
  elapsedSeconds,
  comicStatus,
  comicImageUrl,
  comicErrorCode,
  onGenerateComic,
  onReplay,
}: Props) {
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  const comicButtonText = comicStatus === "success" ? "重新生成案件漫画" : "生成案件漫画";

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
      <section className="comic-recap" aria-label="案件漫画">
        <div className="comic-recap-header">
          <button
            className="secondary-button comic-button"
            type="button"
            disabled={comicStatus === "loading"}
            onClick={onGenerateComic}
          >
            {comicStatus === "loading" ? "正在生成漫画" : comicButtonText}
          </button>
        </div>
        {comicStatus === "loading" && <p className="comic-note">正在生成更有悬疑感的漫画画面，请稍等。</p>}
        {comicStatus === "error" && (
          <p className="comic-error">漫画生成失败，可重新尝试。{comicErrorCode ? `错误码：${comicErrorCode}` : ""}</p>
        )}
        {comicStatus === "success" && comicImageUrl && (
          <div className="comic-output">
            {/* Model-generated URLs can be temporary and unconfigured for next/image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={comicImageUrl} src={comicImageUrl} alt="案件漫画" />
            <a className="secondary-button comic-save-button" href={comicImageUrl} download="wanwuyouxi-comic.png" target="_blank" rel="noreferrer">
              保存漫画
            </a>
          </div>
        )}
      </section>
      <div className="action-stack compact">
        <button className="primary-button" type="button" onClick={onReplay}>再拍一个现场 <span aria-hidden="true">↗</span></button>
        <button className="secondary-button" type="button" onClick={() => window.print()}>保存案件卡</button>
      </div>
    </div>
  );
}
