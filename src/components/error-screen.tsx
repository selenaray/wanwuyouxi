export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="screen error-screen">
      <span className="error-code">SIGNAL LOST</span>
      <div className="error-glyph">×</div>
      <p className="eyebrow">GENERATION INTERRUPTED</p>
      <h1>现场重建超时</h1>
      <p>现场分析没有在预期时间内完成。你可以直接重试，或换一张更清晰的照片。</p>
      <button className="primary-button" type="button" onClick={onRetry}>重新扫描 <span aria-hidden="true">↻</span></button>
    </div>
  );
}
