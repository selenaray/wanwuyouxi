import { render, screen, within } from "@testing-library/react";

import { MOCK_CASE, SAMPLE_TRUTH } from "@/features/game/mock-case";

import { ResultScreen } from "./result-screen";

describe("ResultScreen", () => {
  it("renders all case metrics with their values", () => {
    render(
      <ResultScreen
        game={MOCK_CASE}
        truth={SAMPLE_TRUTH}
        firstAnswerCorrect
        elapsedSeconds={125}
        comicStatus="idle"
        comicImageUrl={null}
        comicPanels={null}
        comicErrorCode={null}
        onGenerateComic={() => undefined}
        onReplay={() => undefined}
      />,
    );

    const metrics = screen.getByLabelText("案件统计");
    expect(within(metrics).getByText("02:05")).toBeVisible();
    expect(within(metrics).getByText("03 / 03")).toBeVisible();
    expect(within(metrics).getByText("S")).toBeVisible();
  });
});
