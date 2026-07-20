import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createClientRequestId,
  createGenerationJob,
  createSession,
  deleteImage,
  getGenerationJob,
  getPlayerCase,
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
    const playerCase = {
      version: 2,
      title: "午夜桌面的证词",
      caseNumber: "WY-V2-001",
      background: "闭馆前，保管箱钥匙在这张桌边短暂失踪，三个人都声称没有移动关键物品。",
      objective: "检查三件物证，判断谁的证词与现场矛盾。",
      interactionMode: "HOTSPOT",
      evidence: [
        { id: "ev-lamp", visualFactId: "vf-lamp", suspectId: "su-lin", objectName: "台灯", publicDescription: "灯罩朝向墙面，与值班记录中的照明方向不同。", regionHint: "左侧", x: 0.24, y: 0.35, radius: 0.08, confidence: 0.95 },
        { id: "ev-book", visualFactId: "vf-book", suspectId: "su-zhou", objectName: "书本", publicDescription: "书页留下朝向门口的反向折痕。", regionHint: "中央", x: 0.51, y: 0.55, radius: 0.08, confidence: 0.94 },
        { id: "ev-cup", visualFactId: "vf-cup", suspectId: "su-qiao", objectName: "杯子", publicDescription: "杯底的新水印覆盖了原本连续的灰尘。", regionHint: "右侧", x: 0.76, y: 0.62, radius: 0.08, confidence: 0.93 },
      ],
      suspects: [
        { id: "su-lin", name: "林默", identity: "夜班管理员", relation: "负责闭馆巡检", personalityTags: ["克制", "谨慎"], portraitKey: "noir-01", initialTestimony: "我只关了台灯，没有碰桌上的其他东西。" },
        { id: "su-zhou", name: "周岚", identity: "资料员", relation: "最后整理借阅资料", personalityTags: ["直接", "急躁"], portraitKey: "noir-02", initialTestimony: "我把书合上后就离开了。" },
        { id: "su-qiao", name: "乔野", identity: "临时访客", relation: "在闭馆前来取文件", personalityTags: ["冷静", "回避"], portraitKey: "noir-03", initialTestimony: "杯子从始至终都在原位。" },
      ],
      claims: [
        { id: "cl-lin", suspectId: "su-lin", text: "我只调整了台灯。" },
        { id: "cl-zhou", suspectId: "su-zhou", text: "我合上书后马上离开。" },
        { id: "cl-qiao", suspectId: "su-qiao", text: "杯子一直没有离开原位。" },
      ],
      wrongAnswerHint: "把证词里的绝对说法与物证的新旧痕迹对照。",
    };
    const progress = { openedClueIds: [], attemptCount: 0, completed: false };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(apiResponse({ case: playerCase, progress })));
    await expect(getPlayerCase("case-v2")).resolves.toMatchObject({ case: { version: 2 } });

    const privateCases = [
      { ...playerCase, liarSuspectId: "su-qiao" },
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
