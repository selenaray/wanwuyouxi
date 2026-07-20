import type { PublicSuspect } from "@/features/game/types";

export function SuspectSheet({ suspect, onClose }: { suspect: PublicSuspect; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" role="presentation">
      <section className="clue-sheet suspect-sheet" role="dialog" aria-modal="true" aria-labelledby="suspect-title">
        <div className="sheet-handle" />
        <div className="suspect-sheet-profile">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/portraits/${suspect.portraitKey}.webp`} alt={`${suspect.name}角色立绘`} />
          <div>
            <p className="eyebrow">SUSPECT FILE</p>
            <h2 id="suspect-title">{suspect.name}</h2>
            <strong>{suspect.identity}</strong>
          </div>
        </div>
        <p className="suspect-relation">与案件的关系：{suspect.relation}</p>
        <div className="personality-tags suspect-sheet-tags">
          {suspect.personalityTags.map((tag) => <em key={tag}>{tag}</em>)}
        </div>
        <blockquote>{suspect.initialTestimony}</blockquote>
        <button className="secondary-button" type="button" onClick={onClose}>返回现场</button>
      </section>
    </div>
  );
}
