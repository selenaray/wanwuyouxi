import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { toV2PlayerCase, V2PrivateCaseSchema } from "@/server/cases/v2-contracts";
import { validV2Case } from "@/server/cases/v2-contracts.fixture";

import { ExploreScreen } from "./explore-screen";

const fallbackCase = {
  ...toV2PlayerCase(V2PrivateCaseSchema.parse(validV2Case)),
  interactionMode: "CARD_FALLBACK" as const,
};

describe("ExploreScreen", () => {
  it("keeps visible evidence hotspots when a live case falls back to safe positions", () => {
    const onOpenEvidence = vi.fn();

    render(
      <ExploreScreen
        game={fallbackCase}
        imageUrl="/sample-scene.svg"
        openedClueIds={[]}
        activeClueId={null}
        openedEvidenceIds={[]}
        unlockedSuspectIds={[]}
        activeSuspectId={null}
        onOpenClue={vi.fn()}
        onOpenEvidence={onOpenEvidence}
        onCloseClue={vi.fn()}
        onOpenSuspect={vi.fn()}
        onCloseSuspect={vi.fn()}
        onDeduce={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /查看.+物证/ })).toHaveLength(6);
    fireEvent.click(screen.getAllByRole("button", { name: "查看杯子物证" })[0]);

    expect(onOpenEvidence).toHaveBeenCalledWith("ev-cup");
  });
});
