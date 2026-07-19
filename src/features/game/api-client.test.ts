import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createClientRequestId,
  createGenerationJob,
  createSession,
  deleteImage,
  GameApiError,
  getGenerationJob,
  revealCase,
  submitAnswer,
  uploadImage,
  waitForGenerationJob,
} from "./api-client";

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

    expect(await getGenerationJob("job")).toEqual({ jobId: "job", status: "SUCCEEDED", caseId: "case" });
    expect(await submitAnswer("case", 0)).toMatchObject({ correct: false, hint: "再想想" });
  });

  it("accepts the retryable worker status while a job is recovering", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResponse({
      jobId: "job",
      status: "RETRYABLE_FAILED",
      caseId: null,
    })));

    await expect(getGenerationJob("job")).resolves.toMatchObject({ status: "RETRYABLE_FAILED" });
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

  it("maps structured failures and rejects malformed success payloads", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        error: { code: "PHOTO_REJECTED", message: "请换一张照片", retryable: false },
        traceId: "trace",
      }), { status: 422 }))
      .mockResolvedValueOnce(apiResponse({ jobId: 123, status: "UNKNOWN" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSession()).rejects.toMatchObject<GameApiError>({ code: "PHOTO_REJECTED", retryable: false });
    await expect(getGenerationJob("job")).rejects.toMatchObject<GameApiError>({ code: "INVALID_RESPONSE", retryable: true });
  });
});
