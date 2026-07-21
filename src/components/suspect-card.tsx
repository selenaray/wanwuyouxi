import type { PublicSuspect } from "@/features/game/types";

type Props = {
  suspect: PublicSuspect;
  unlocked: boolean;
  onOpen: () => void;
};

export function SuspectCard({ suspect, unlocked, onOpen }: Props) {
  return (
    <button
      type="button"
      className={`suspect-card ${unlocked ? "unlocked" : "locked"}`}
      disabled={!unlocked}
      onClick={onOpen}
      aria-label={`查看${suspect.name}角色卡`}
    >
      <span className="suspect-portrait" aria-hidden={!unlocked}>
        {unlocked ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/portraits/${suspect.portraitKey}.webp`} alt={`${suspect.name}角色立绘`} />
        ) : <span className="suspect-silhouette" />}
      </span>
      {unlocked ? (
        <span className="suspect-card-copy">
          <strong>{suspect.name}</strong>
          <small>{suspect.identity}</small>
          <span className="personality-tags">
            {suspect.personalityTags.map((tag) => <em key={tag}>{tag}</em>)}
          </span>
        </span>
      ) : <span className="suspect-locked-label">嫌疑人未解锁</span>}
    </button>
  );
}
