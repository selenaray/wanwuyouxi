import { isV2PlayerCase, type PlayerCase } from "@/features/game/types";

import { ClueHotspot } from "./clue-hotspot";
import { ClueSheet } from "./clue-sheet";
import { SuspectCard } from "./suspect-card";
import { SuspectSheet } from "./suspect-sheet";

type Props = {
  imageUrl: string;
  openedClueIds: string[];
  activeClueId: string | null;
  openedEvidenceIds: string[];
  unlockedSuspectIds: string[];
  activeSuspectId: string | null;
  onOpenClue: (clueId: string) => void;
  onOpenEvidence: (evidenceId: string) => void;
  onCloseClue: () => void;
  onOpenSuspect: (suspectId: string) => void;
  onCloseSuspect: () => void;
  onDeduce: () => void;
  game: PlayerCase;
};

export function ExploreScreen({
  game,
  imageUrl,
  openedClueIds,
  activeClueId,
  openedEvidenceIds,
  unlockedSuspectIds,
  activeSuspectId,
  onOpenClue,
  onOpenEvidence,
  onCloseClue,
  onOpenSuspect,
  onCloseSuspect,
  onDeduce,
}: Props) {
  const v2 = isV2PlayerCase(game);
  const activeClue = v2
    ? game.evidence.find((evidence) => evidence.id === activeClueId) ?? null
    : game.clues.find((clue) => clue.id === activeClueId) ?? null;
  const activeSuspect = v2
    ? game.suspects.find((suspect) => suspect.id === activeSuspectId) ?? null
    : null;
  const foundCount = v2 ? openedEvidenceIds.length : openedClueIds.length;
  const complete = v2
    ? game.evidence.every((evidence) => openedEvidenceIds.includes(evidence.id))
      && game.suspects.every((suspect) => unlockedSuspectIds.includes(suspect.id))
    : game.clues.every((clue) => openedClueIds.includes(clue.id));

  return (
    <div className={`screen explore-screen ${v2 ? "v2-explore-screen" : ""}`}>
      <header className="overlay-top-bar">
        <div><p className="eyebrow">LIVE SCENE</p><strong>{game.title}</strong></div>
        <span className="clue-counter">{foundCount}<small>/3</small></span>
      </header>
      <div className="scene-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="可探索的案发现场" />
        <div className="scene-vignette" />
        {game.interactionMode === "CARD_FALLBACK" ? null : v2
          ? game.evidence.map((evidence) => (
              <ClueHotspot
                key={evidence.id}
                clue={evidence}
                evidence
                collected={openedEvidenceIds.includes(evidence.id)}
                onOpen={() => onOpenEvidence(evidence.id)}
              />
            ))
          : game.clues.map((clue) => (
              <ClueHotspot key={clue.id} clue={clue} collected={openedClueIds.includes(clue.id)} onOpen={() => onOpenClue(clue.id)} />
            ))}
      </div>
      {game.interactionMode === "CARD_FALLBACK" && (
        <div className="fallback-clue-list">
          {v2
            ? game.evidence.map((evidence) => (
                <button key={evidence.id} type="button" className="secondary-button" onClick={() => onOpenEvidence(evidence.id)}>
                  查看{evidence.objectName}物证
                </button>
              ))
            : game.clues.map((clue) => (
                <button key={clue.id} type="button" className="secondary-button" onClick={() => onOpenClue(clue.id)}>
                  查看{clue.objectName}
                </button>
              ))}
        </div>
      )}
      {v2 && (
        <section className="suspect-rail" aria-label="嫌疑人角色卡">
          {game.suspects.map((suspect) => (
            <SuspectCard
              key={suspect.id}
              suspect={suspect}
              unlocked={unlockedSuspectIds.includes(suspect.id)}
              onOpen={() => onOpenSuspect(suspect.id)}
            />
          ))}
        </section>
      )}
      <div className="scene-footer">
        <div>
          <p className="eyebrow">INVESTIGATION</p>
          <strong>{v2
            ? `已发现 ${openedEvidenceIds.length}/3 物证 · 已解锁 ${unlockedSuspectIds.length}/3 嫌疑人`
            : complete ? "线索齐全，可以开始推理" : "点击现场中的微光，收集线索"}</strong>
        </div>
        <button className="primary-button" type="button" disabled={!complete} onClick={onDeduce}>
          {v2 && complete ? "整理证词" : "开始推理"} <span aria-hidden="true">→</span>
        </button>
      </div>
      {activeClue && <ClueSheet clue={activeClue} onClose={onCloseClue} />}
      {v2 && activeSuspect && <SuspectSheet game={game} suspect={activeSuspect} onClose={onCloseSuspect} />}
    </div>
  );
}
