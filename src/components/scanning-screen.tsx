type Props = { imageUrl: string };

export function ScanningScreen({ imageUrl }: Props) {
  return (
    <div className="screen scanning-screen">
      <div className="scan-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="正在分析的现场" />
        <div className="scan-shade" />
        <div className="scan-line" />
        <div className="scan-grid" />
        <div className="scan-target target-a" /><div className="scan-target target-b" /><div className="scan-target target-c" />
      </div>
      <div className="scanning-copy">
        <div className="scanner-glyph" aria-hidden="true">⌁</div>
        <p className="eyebrow">SCANNING REALITY</p>
        <h2>正在重建案发现场</h2>
        <p>识别空间与可疑物品…</p>
        <div className="progress-track"><span /></div>
        <div className="scan-metrics"><span>OBJECTS 07</span><span>CLUES 03</span><span>STORY 68%</span></div>
      </div>
    </div>
  );
}
