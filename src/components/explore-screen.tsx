import { MOCK_CASE } from "@/features/game/mock-case";

import { ClueHotspot } from "./clue-hotspot";
import { ClueSheet } from "./clue-sheet";

type Props = {
  imageUrl: string;
  openedClueIds: string[];
  activeClueId: string | null;
  onOpenClue: (clueId: string) => void;
  onCloseClue: () => void;
  onDeduce: () => void;
};

export function ExploreScreen({ imageUrl, openedClueIds, activeClueId, onOpenClue, onCloseClue, onDeduce }: Props) {
  const activeClue = MOCK_CASE.clues.find((clue) => clue.id === activeClueId) ?? null;
  const complete = openedClueIds.length === 3;

  return (
    <div className="screen explore-screen">
      <header className="overlay-top-bar">
        <div><p className="eyebrow">LIVE SCENE</p><strong>{MOCK_CASE.title}</strong></div>
        <span className="clue-counter">{openedClueIds.length}<small>/3</small></span>
      </header>
      <div className="scene-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="可探索的案发现场" />
        <div className="scene-vignette" />
        {MOCK_CASE.clues.map((clue) => (
          <ClueHotspot key={clue.id} clue={clue} collected={openedClueIds.includes(clue.id)} onOpen={() => onOpenClue(clue.id)} />
        ))}
      </div>
      <div className="scene-footer">
        <div><p className="eyebrow">INVESTIGATION</p><strong>{complete ? "线索齐全，可以开始推理" : "点击现场中的微光，收集线索"}</strong></div>
        <button className="primary-button" type="button" disabled={!complete} onClick={onDeduce}>开始推理 <span aria-hidden="true">→</span></button>
      </div>
      {activeClue && <ClueSheet clue={activeClue} onClose={onCloseClue} />}
    </div>
  );
}
