"use client";

import { useEffect, useReducer, useState } from "react";

import { CaptureScreen } from "@/components/capture-screen";
import { CaseBriefScreen } from "@/components/case-brief-screen";
import { DeductionScreen } from "@/components/deduction-screen";
import { ErrorScreen } from "@/components/error-screen";
import { ExploreScreen } from "@/components/explore-screen";
import { HomeScreen } from "@/components/home-screen";
import { PhoneShell } from "@/components/phone-shell";
import { PrivacySheet } from "@/components/privacy-sheet";
import { ResultScreen } from "@/components/result-screen";
import { ScanningScreen } from "@/components/scanning-screen";

import { createInitialState, transitionGame } from "./game-machine";
import { SAMPLE_IMAGE_URL } from "./mock-case";
import { loadGameState, saveGameState } from "./persistence";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/heic"];

export function GameApp() {
  const [state, dispatch] = useReducer(transitionGame, undefined, createInitialState);
  const [hydrated, setHydrated] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const restored = loadGameState();
      if (restored.selectedImageUrl === SAMPLE_IMAGE_URL) {
        dispatch({ type: "HYDRATE", state: restored });
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (hydrated) saveGameState(state);
  }, [hydrated, state]);

  useEffect(() => {
    if (state.screen !== "scanning") return;
    const timer = window.setTimeout(() => dispatch({ type: "SCAN_COMPLETE" }), 1600);
    return () => window.clearTimeout(timer);
  }, [state.screen]);

  const selectFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError("目前只支持 JPEG、PNG 或 HEIC 图片");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError("图片超过 5 MB，请选择更小的照片");
      return;
    }
    setFileError(null);
    const imageUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : SAMPLE_IMAGE_URL;
    dispatch({ type: "SELECT_IMAGE", imageUrl, imageName: file.name });
  };

  const elapsedSeconds = state.startedAt && state.revealedAt
    ? Math.max(1, Math.round((state.revealedAt - state.startedAt) / 1000))
    : 167;

  return (
    <PhoneShell>
      {state.screen === "home" && (
        <HomeScreen
          onStart={() => dispatch({ type: "START" })}
          onSample={() => dispatch({ type: "USE_SAMPLE" })}
          onPrivacy={() => setPrivacyOpen(true)}
        />
      )}
      {state.screen === "capture" && (
        <>
          <CaptureScreen
            imageUrl={state.selectedImageUrl}
            imageName={state.selectedImageName}
            onSelect={selectFile}
            onConfirm={() => dispatch({ type: "CONFIRM_IMAGE" })}
            onBack={() => dispatch({ type: "REPLAY" })}
          />
          {fileError && <div className="inline-error" role="alert">{fileError}</div>}
        </>
      )}
      {state.screen === "scanning" && <ScanningScreen imageUrl={state.selectedImageUrl ?? SAMPLE_IMAGE_URL} />}
      {state.screen === "briefing" && <CaseBriefScreen onEnter={() => dispatch({ type: "ENTER_SCENE", now: Date.now() })} />}
      {state.screen === "exploring" && (
        <ExploreScreen
          imageUrl={state.selectedImageUrl ?? SAMPLE_IMAGE_URL}
          openedClueIds={state.openedClueIds}
          activeClueId={state.activeClueId}
          onOpenClue={(clueId) => dispatch({ type: "OPEN_CLUE", clueId })}
          onCloseClue={() => dispatch({ type: "CLOSE_CLUE" })}
          onDeduce={() => dispatch({ type: "BEGIN_DEDUCTION" })}
        />
      )}
      {state.screen === "deduction" && (
        <DeductionScreen
          selectedAnswerIndex={state.selectedAnswerIndex}
          showHint={state.showHint}
          onSelect={(answerIndex) => dispatch({ type: "SELECT_ANSWER", answerIndex })}
          onSubmit={() => {
            if (state.selectedAnswerIndex !== null) {
              dispatch({ type: "SUBMIT_ANSWER", answerIndex: state.selectedAnswerIndex, now: Date.now() });
            }
          }}
        />
      )}
      {state.screen === "result" && (
        <ResultScreen firstAnswerCorrect={state.firstAnswerCorrect} elapsedSeconds={elapsedSeconds} onReplay={() => dispatch({ type: "REPLAY" })} />
      )}
      {state.screen === "error" && <ErrorScreen onRetry={() => dispatch({ type: "RETRY_SCAN" })} />}
      {privacyOpen && <PrivacySheet onClose={() => setPrivacyOpen(false)} />}
    </PhoneShell>
  );
}
