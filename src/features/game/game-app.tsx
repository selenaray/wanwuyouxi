"use client";

import { useEffect, useReducer, useRef, useState } from "react";

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
import {
  createClientRequestId,
  createGenerationJob,
  createSession,
  deleteImage,
  GameApiError,
  getPlayerCase,
  revealCase,
  submitAnswer,
  uploadImage,
  waitForGenerationJob,
} from "./api-client";
import { prepareImageForUpload } from "./image-compression";
import { SAMPLE_IMAGE_URL } from "./mock-case";
import { loadGameState, saveGameState } from "./persistence";
import { isV2PlayerCase } from "./types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"];

export function GameApp() {
  const [state, dispatch] = useReducer(transitionGame, undefined, createInitialState);
  const [hydrated, setHydrated] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [answerBusy, setAnswerBusy] = useState(false);
  const generationRunning = useRef(false);
  const resumableJobId = useRef<string | null>(null);
  const selectedObjectUrl = useRef<string | null>(null);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const restored = loadGameState();
      if (
        restored.selectedImageUrl === SAMPLE_IMAGE_URL ||
        (restored.mode === "live" && Boolean(restored.jobId || restored.caseId))
      ) {
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
    resumableJobId.current = state.jobId;
  }, [state.jobId]);

  useEffect(() => () => {
    if (selectedObjectUrl.current && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(selectedObjectUrl.current);
    }
  }, []);

  useEffect(() => {
    if (state.screen !== "scanning") return;
    if (state.mode === "sample") {
      const timer = window.setTimeout(() => dispatch({ type: "SCAN_COMPLETE" }), 1600);
      return () => window.clearTimeout(timer);
    }
    if (state.mode !== "live" || generationRunning.current) return;
    if (!selectedFile && !resumableJobId.current) {
      dispatch({ type: "SCAN_FAILED", errorCode: "PHOTO_UNAVAILABLE" });
      return;
    }

    let cancelled = false;
    generationRunning.current = true;
    void (async () => {
      try {
        let jobId = resumableJobId.current;
        if (!jobId) {
          await createSession();
          const prepared = await prepareImageForUpload(selectedFile!);
          const uploaded = await uploadImage(prepared);
          const job = await createGenerationJob(uploaded.imageId, createClientRequestId());
          jobId = job.jobId;
          resumableJobId.current = jobId;
          if (!cancelled) dispatch({ type: "GENERATION_STARTED", imageId: uploaded.imageId, jobId });
        }

        const completedJob = await waitForGenerationJob(jobId);
        if (completedJob.status !== "SUCCEEDED" || !completedJob.caseId) {
          throw new GameApiError(
            completedJob.errorCode ?? completedJob.status,
            "现场重建未完成",
            completedJob.status === "RETRYABLE_FAILED",
          );
        }
        const player = await getPlayerCase(completedJob.caseId);
        if (!cancelled) {
          dispatch({ type: "GENERATION_SUCCEEDED", caseId: completedJob.caseId, caseData: player.case });
        }
      } catch (error) {
        if (!cancelled) {
          dispatch({
            type: "SCAN_FAILED",
            errorCode: error instanceof GameApiError ? error.code : "GENERATION_FAILED",
          });
        }
      } finally {
        generationRunning.current = false;
      }
    })();

    return () => { cancelled = true; };
  }, [selectedFile, state.mode, state.screen]);

  useEffect(() => {
    if (!hydrated || state.mode !== "live" || !state.caseId || state.caseData) return;
    void getPlayerCase(state.caseId)
      .then((player) => dispatch({ type: "GENERATION_SUCCEEDED", caseId: state.caseId!, caseData: player.case }))
      .catch(() => dispatch({ type: "SCAN_FAILED", errorCode: "GENERATION_FAILED" }));
  }, [hydrated, state.caseData, state.caseId, state.mode]);

  const selectFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError("目前只支持 JPEG、PNG、HEIC 或 HEIF 图片");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError("图片超过 5 MB，请选择更小的照片");
      return;
    }
    setFileError(null);
    setSelectedFile(file);
    if (selectedObjectUrl.current && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(selectedObjectUrl.current);
    }
    const imageUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : SAMPLE_IMAGE_URL;
    selectedObjectUrl.current = imageUrl === SAMPLE_IMAGE_URL ? null : imageUrl;
    dispatch({ type: "SELECT_IMAGE", imageUrl, imageName: file.name });
  };

  const elapsedSeconds = state.startedAt && state.revealedAt
    ? Math.max(1, Math.round((state.revealedAt - state.startedAt) / 1000))
    : 167;

  const submitCurrentAnswer = async () => {
    if (state.selectedAnswerIndex === null || answerBusy) return;
    if (state.mode === "sample") {
      dispatch({ type: "SUBMIT_ANSWER", answerIndex: state.selectedAnswerIndex, now: Date.now() });
      return;
    }
    if (!state.caseId) return;

    setAnswerBusy(true);
    try {
      const answer = await submitAnswer(state.caseId, state.selectedAnswerIndex);
      dispatch({
        type: "ANSWER_RESPONSE",
        correct: answer.correct,
        completed: answer.completed,
        attemptCount: answer.attemptCount,
        now: Date.now(),
      });
      if (answer.completed) {
        const reveal = await revealCase(state.caseId);
        dispatch({
          type: "REVEAL_LOADED",
          truth: reveal.truth,
          firstAnswerCorrect: reveal.firstAnswerCorrect,
          now: Date.now(),
        });
      }
    } catch {
      setFileError("答案提交失败，请重试");
    } finally {
      setAnswerBusy(false);
    }
  };

  const replay = () => {
    if (state.mode === "live" && state.imageId) void deleteImage(state.imageId).catch(() => undefined);
    if (selectedObjectUrl.current && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(selectedObjectUrl.current);
      selectedObjectUrl.current = null;
    }
    setSelectedFile(null);
    dispatch({ type: "REPLAY" });
  };

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
            onBack={replay}
          />
          {fileError && <div className="inline-error" role="alert">{fileError}</div>}
        </>
      )}
      {state.screen === "scanning" && <ScanningScreen imageUrl={state.selectedImageUrl ?? SAMPLE_IMAGE_URL} />}
      {state.screen === "briefing" && state.caseData && <CaseBriefScreen game={state.caseData} onEnter={() => dispatch({ type: "ENTER_SCENE", now: Date.now() })} />}
      {state.screen === "exploring" && state.caseData && (
        <ExploreScreen
          game={state.caseData}
          imageUrl={state.selectedImageUrl ?? SAMPLE_IMAGE_URL}
          openedClueIds={state.openedClueIds}
          activeClueId={state.activeClueId}
          openedEvidenceIds={state.openedEvidenceIds}
          unlockedSuspectIds={state.unlockedSuspectIds}
          activeSuspectId={state.activeSuspectId}
          onOpenClue={(clueId) => dispatch({ type: "OPEN_CLUE", clueId })}
          onOpenEvidence={(evidenceId) => dispatch({ type: "OPEN_EVIDENCE", evidenceId })}
          onCloseClue={() => dispatch({ type: "CLOSE_CLUE" })}
          onOpenSuspect={(suspectId) => dispatch({ type: "OPEN_SUSPECT", suspectId })}
          onCloseSuspect={() => dispatch({ type: "CLOSE_SUSPECT" })}
          onDeduce={() => dispatch({ type: "BEGIN_DEDUCTION" })}
        />
      )}
      {state.screen === "deduction" && state.caseData && !isV2PlayerCase(state.caseData) && (
        <DeductionScreen
          game={state.caseData}
          selectedAnswerIndex={state.selectedAnswerIndex}
          showHint={state.showHint}
          onSelect={(answerIndex) => dispatch({ type: "SELECT_ANSWER", answerIndex })}
          onSubmit={() => {
            void submitCurrentAnswer();
          }}
        />
      )}
      {state.screen === "result" && state.caseData && state.truth && (
        <ResultScreen game={state.caseData} truth={state.truth} firstAnswerCorrect={state.firstAnswerCorrect} elapsedSeconds={elapsedSeconds} onReplay={replay} />
      )}
      {state.screen === "error" && (
        <ErrorScreen
          errorCode={state.errorCode}
          onRetry={() => {
            resumableJobId.current = null;
            dispatch({ type: "RETRY_SCAN" });
          }}
        />
      )}
      {privacyOpen && <PrivacySheet onClose={() => setPrivacyOpen(false)} />}
    </PhoneShell>
  );
}
