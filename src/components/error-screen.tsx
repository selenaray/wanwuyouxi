const errorCopy: Record<string, { title: string; description: string }> = {
  GENERATION_TIMEOUT: {
    title: "现场重建超时",
    description: "现场分析没有在预期时间内完成。你可以直接重试，或换一张更清晰的照片。",
  },
  QWEN_TIMEOUT: {
    title: "视觉分析超时",
    description: "视觉模型本次响应过慢，请稍后重新扫描。",
  },
  QWEN_SCHEMA_INVALID: {
    title: "案件生成格式异常",
    description: "视觉模型已经返回结果，但案件结构不完整。重新扫描会创建一个全新的任务。",
  },
  QWEN_JSON_INVALID: {
    title: "案件生成格式异常",
    description: "视觉模型返回的案件内容不完整。重新扫描会创建一个全新的任务。",
  },
  QWEN_RATE_LIMITED: {
    title: "生成服务繁忙",
    description: "视觉模型当前请求较多，请稍等片刻再重新扫描。",
  },
  QWEN_UNAVAILABLE: {
    title: "生成服务暂不可用",
    description: "视觉模型连接失败，请检查网络后重新扫描。",
  },
  TOO_DARK: { title: "照片光线不足", description: "请换一张更明亮、物品更清晰的现场照片。" },
  BLURRY: { title: "照片不够清晰", description: "请保持手机稳定，重新拍摄后再试。" },
  NOT_A_SPACE: { title: "没有识别到现场", description: "请拍摄桌面、房间或咖啡馆角落等完整空间。" },
  TOO_FEW_OBJECTS: { title: "现场物品太少", description: "请换一处至少包含五件明显物品的空间。" },
  UNSAFE: { title: "这张照片无法使用", description: "请避免人脸、证件、聊天记录或其他敏感内容。" },
};

export function ErrorScreen({ errorCode, onRetry }: { errorCode: string | null; onRetry: () => void }) {
  const copy = errorCopy[errorCode ?? ""] ?? {
    title: "现场重建中断",
    description: "生成过程没有正常完成，请重新扫描或换一张照片。",
  };
  return (
    <div className="screen error-screen">
      <span className="error-code">SIGNAL LOST</span>
      <div className="error-glyph">×</div>
      <p className="eyebrow">GENERATION INTERRUPTED</p>
      <h1>{copy.title}</h1>
      <p>{copy.description}</p>
      <button className="primary-button" type="button" onClick={onRetry}>重新扫描 <span aria-hidden="true">↻</span></button>
    </div>
  );
}
