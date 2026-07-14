import type { PlayerCase } from "@/features/game/types";

import { ClueHotspot } from "./clue-hotspot";
import { ClueSheet } from "./clue-sheet";

type Props = {
  imageUrl: string;
  openedClueIds: string[];
  activeClueId: string | null;
  onOpenClue: (clueId: string) => void;
  onCloseClue: () => void;
  onDeduce: () => void;
  game: PlayerCase;
};

export function ExploreScreen({ game, imageUrl, openedClueIds, activeClueId, onOpenClue, onCloseClue, onDeduce }: Props) {
  const activeClue = game.clues.find((clue) => clue.id === activeClueId) ?? null;
  const complete = openedClueIds.length === 3;

  return (
    <div className="screen explore-screen">
      <header className="overlay-top-bar">
        <div><p className="eyebrow">LIVE SCENE</p><strong>{game.title}</strong></div>
        <span className="clue-counter">{openedClueIds.length}<small>/3</small></span>
      </header>
      <div className="scene-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="可探索的案发现场" />
        <div className="scene-vignette" />
        {game.interactionMode === "CARD_FALLBACK" ? null : game.clues.map((clue) => (
          <ClueHotspot key={clue.id} clue={clue} collected={openedClueIds.includes(clue.id)} onOpen={() => onOpenClue(clue.id)} />
        ))}
      </div>
      {game.interactionMode === "CARD_FALLBACK" && (
        <div className="fallback-clue-list">
          {game.clues.map((clue) => (
            <button key={clue.id} type="button" className="secondary-button" onClick={() => onOpenClue(clue.id)}>
              查看{clue.objectName}
            </button>
          ))}
        </div>
      )}
      <div className="scene-footer">
        <div><p className="eyebrow">INVESTIGATION</p><strong>{complete ? "线索齐全，可以开始推理" : "点击现场中的微光，收集线索"}</strong></div>
        <button className="primary-button" type="button" disabled={!complete} onClick={onDeduce}>开始推理 <span aria-hidden="true">→</span></button>
      </div>
      {activeClue && <ClueSheet clue={activeClue} onClose={onCloseClue} />}
    </div>
  );
}
