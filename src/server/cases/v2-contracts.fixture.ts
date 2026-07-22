export const validObservation = {
  decision: "PASS" as const,
  sceneSummary: "一张有台灯、书本和杯子的木桌",
  riskLabels: [],
  visualFacts: [
    { id: "vf-lamp", objectName: "台灯", visibleDescription: "灯罩朝向墙面", regionHint: "左侧", x: 0.24, y: 0.35, radius: 0.08, confidence: 0.95 },
    { id: "vf-book", objectName: "书本", visibleDescription: "书页有反向折痕", regionHint: "中央", x: 0.51, y: 0.55, radius: 0.08, confidence: 0.94 },
    { id: "vf-cup", objectName: "杯子", visibleDescription: "杯底有一圈水印", regionHint: "右侧", x: 0.76, y: 0.62, radius: 0.08, confidence: 0.93 },
  ],
};

export const validV2Case = {
  version: 2 as const,
  title: "午夜桌面的证词",
  caseNumber: "WY-V2-001",
  background: "闭馆前，保管箱钥匙在这张桌边短暂失踪，三个人都声称没有移动关键物品。",
  objective: "检查三件物证，判断谁的证词与现场矛盾。",
  interactionMode: "HOTSPOT" as const,
  visualFacts: validObservation.visualFacts,
  evidence: [
    { id: "ev-lamp", visualFactId: "vf-lamp", suspectId: "su-shen", objectName: "台灯", publicDescription: "灯罩朝向墙面，与值班记录中的照明方向不同。", regionHint: "左侧", x: 0.24, y: 0.35, radius: 0.08, confidence: 0.95 },
    { id: "ev-book", visualFactId: "vf-book", suspectId: "su-lin", objectName: "书本", publicDescription: "书页留下朝向门口的反向折痕。", regionHint: "中央", x: 0.51, y: 0.55, radius: 0.08, confidence: 0.94 },
    { id: "ev-cup", visualFactId: "vf-cup", suspectId: "su-jiang", objectName: "杯子", publicDescription: "杯底的新水印覆盖了原本连续的灰尘。", regionHint: "右侧", x: 0.76, y: 0.62, radius: 0.08, confidence: 0.93 },
  ],
  suspects: [
    { id: "su-shen", name: "沈砚舟", gender: "男", age: 35, identity: "私家侦探", relation: "负责闭馆巡检", personalityTags: ["冷静", "克制"], portraitKey: "noir-01", initialTestimony: "我只关了台灯，没有碰桌上的其他东西。", privateAction: "闭馆前调整过台灯", allowedFactIds: ["tf-1", "cl-lin"] },
    { id: "su-lin", name: "林晚晴", gender: "女", age: 29, identity: "心理咨询师", relation: "最后整理借阅资料", personalityTags: ["理性", "洞察"], portraitKey: "noir-02", initialTestimony: "我把书合上后就离开了。", privateAction: "整理书本后离开", allowedFactIds: ["tf-2", "cl-zhou"] },
    { id: "su-jiang", name: "江野", gender: "男", age: 22, identity: "网络主播", relation: "在闭馆前来取文件", personalityTags: ["外向", "冒险"], portraitKey: "noir-09", initialTestimony: "杯子从始至终都在原位。", privateAction: "移动杯子取走钥匙后放回", allowedFactIds: ["tf-3", "cl-qiao"] },
  ],
  timelineFacts: [
    { id: "tf-1", timeLabel: "22:40", text: "沈砚舟完成照明巡检。" },
    { id: "tf-2", timeLabel: "22:45", text: "林晚晴合上最后一本资料。" },
    { id: "tf-3", timeLabel: "22:50", text: "江野在桌边短暂停留。" },
  ],
  claims: [
    { id: "cl-lin", suspectId: "su-shen", text: "我只调整了台灯。", factRefs: ["tf-1"], evidenceRefs: ["ev-lamp"] },
    { id: "cl-zhou", suspectId: "su-lin", text: "我合上书后马上离开。", factRefs: ["tf-2"], evidenceRefs: ["ev-book"] },
    { id: "cl-qiao", suspectId: "su-jiang", text: "杯子一直没有离开原位。", factRefs: ["tf-3"], evidenceRefs: ["ev-cup"] },
  ],
  liarSuspectId: "su-jiang",
  contradiction: { claimId: "cl-qiao", evidenceId: "ev-cup", explanation: "新水印覆盖旧灰尘，证明杯子曾被拿起并放回。" },
  wrongAnswerHint: "把证词里的绝对说法与物证的新旧痕迹对照。",
  truth: { summary: "江野移动杯子取走钥匙后又将其放回。", motive: "他想在不惊动管理员的情况下取走文件。", evidenceChain: ["杯底新水印", "被覆盖的旧灰尘", "杯子始终未动的证词"] },
};
