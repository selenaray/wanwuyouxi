import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createClientRequestId,
  createGenerationJob,
  createSession,
  deleteImage,
  generateCaseComic,
  getGenerationJob,
  getPlayerCase,
  revealCase,
  submitAnswer,
  uploadImage,
  waitForGenerationJob,
} from "./api-client";
import { MOCK_CASE } from "./mock-case";

function apiResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: true, data, traceId: "trace" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("game API client", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("creates a request UUID when randomUUID is unavailable on LAN HTTP", () => {
    const insecureLanCrypto = {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(0),
    };

    expect(createClientRequestId(insecureLanCrypto)).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("waits long enough for a successful 100-second retried generation", async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      calls += 1;
      return Promise.resolve(apiResponse(calls >= 101
        ? { jobId: "job", status: "SUCCEEDED", caseId: "case" }
        : { jobId: "job", status: "PROCESSING", caseId: null }));
    }));
    const result = waitForGenerationJob("job");
    const expectation = expect(result).resolves.toMatchObject({ status: "SUCCEEDED", caseId: "case" });
    await vi.advanceTimersByTimeAsync(100_000);

    await expectation;
  });

  it("uses same-origin credentials for anonymous session and generation calls", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiResponse({ sessionPublicId: "public", expiresAt: "2026-07-21T00:00:00.000Z" }, 201))
      .mockResolvedValueOnce(apiResponse({ jobId: "d90ce98b-36c2-4f1f-b74c-f43bc1d4a665", status: "PENDING" }, 202));
    vi.stubGlobal("fetch", fetchMock);

    await createSession();
    await createGenerationJob("d4d447fd-13e6-44df-b1a3-44a06320d0de", "capture-1");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/sessions", expect.objectContaining({ credentials: "same-origin" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/generation-jobs", expect.objectContaining({
      credentials: "same-origin",
      headers: expect.objectContaining({ "idempotency-key": "capture-1" }),
    }));
  });

  it("parses job status and server-authoritative answer results", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiResponse({ jobId: "job", status: "SUCCEEDED", caseId: "case" }))
      .mockResolvedValueOnce(apiResponse({ correct: false, attemptCount: 1, completed: false, hint: "再想想" }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await getGenerationJob("job")).toEqual({
      jobId: "job",
      status: "SUCCEEDED",
      caseId: "case",
      errorCode: null,
    });
    expect(await submitAnswer("case", 0)).toMatchObject({ correct: false, hint: "再想想" });
  });

  it("accepts the retryable worker status while a job is recovering", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResponse({
      jobId: "job",
      status: "RETRYABLE_FAILED",
      caseId: null,
      errorCode: "QWEN_SCHEMA_INVALID",
    })));

    await expect(getGenerationJob("job")).resolves.toMatchObject({
      status: "RETRYABLE_FAILED",
      errorCode: "QWEN_SCHEMA_INVALID",
    });
  });

  it("sends a multipart upload and supports reveal and deletion", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(apiResponse({ imageId: "image", width: 1200, height: 900, expiresAt: "later" }, 201))
      .mockResolvedValueOnce(apiResponse({ truth: "真相", correctAnswerIndex: 2, firstAnswerCorrect: true }))
      .mockResolvedValueOnce(apiResponse({ deleted: true }));
    vi.stubGlobal("fetch", fetchMock);

    await uploadImage(new File(["photo"], "room.jpg", { type: "image/jpeg" }));
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeInstanceOf(FormData);
    await expect(revealCase("case")).resolves.toMatchObject({ truth: "真相" });
    await expect(deleteImage("image")).resolves.toEqual({ deleted: true });
  });

  it("posts a solved case to generate a four-panel comic", async () => {
    const fetchMock = vi.fn().mockResolvedValue(apiResponse({
      imageUrl: "https://example.com/comic.png",
      width: 2048,
      height: 2048,
      panels: [
        { title: "案发前", description: "现场平静。" },
        { title: "关键动作", description: "嫌疑人行动。" },
        { title: "伪装现场", description: "现场被恢复。" },
        { title: "真相揭晓", description: "侦探复盘。" },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const comic = await generateCaseComic({
      game: MOCK_CASE,
      truth: "真相",
      correctAnswerIndex: 2,
    });
    expect(comic.imageUrl).toBe("https://example.com/comic.png");
    expect(comic.panels).toHaveLength(4);
    expect(comic.panels[0]).toEqual({ title: "案发前", description: "现场平静。" });
    expect(fetchMock).toHaveBeenCalledWith("/api/comic-generation", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
    }));
  });

  it("maps structured failures and rejects malformed success payloads", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        error: { code: "PHOTO_REJECTED", message: "请换一张照片", retryable: false },
        traceId: "trace",
      }), { status: 422 }))
      .mockResolvedValueOnce(apiResponse({ jobId: 123, status: "UNKNOWN" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSession()).rejects.toMatchObject({ code: "PHOTO_REJECTED", retryable: false });
    await expect(getGenerationJob("job")).rejects.toMatchObject({ code: "INVALID_RESPONSE", retryable: true });
  });

  it("parses a public V2 case and strictly rejects private fields", async () => {
    const playerCase = MOCK_CASE;
    const progress = { openedClueIds: [], attemptCount: 0, completed: false };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResponse({ case: playerCase, progress })));
    await expect(getPlayerCase("case-v2")).resolves.toMatchObject({ case: { version: 2 } });

    const privateCases = [
      { ...playerCase, liarSuspectId: "su-jiang" },
      {
        ...playerCase,
        suspects: [
          { ...playerCase.suspects[0], privateAction: "偷偷调整了台灯", allowedFactIds: ["tf-1"] },
          playerCase.suspects[1],
          playerCase.suspects[2],
        ],
      },
      {
        ...playerCase,
        claims: [
          { ...playerCase.claims[0], factRefs: ["tf-1"], evidenceRefs: ["ev-lamp"] },
          playerCase.claims[1],
          playerCase.claims[2],
        ],
      },
    ];

    for (const privateCase of privateCases) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResponse({ case: privateCase, progress })));
      await expect(getPlayerCase("case-v2-private")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });
});
