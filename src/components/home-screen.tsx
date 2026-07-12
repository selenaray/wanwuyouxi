type Props = {
  onStart: () => void;
  onSample: () => void;
  onPrivacy: () => void;
};

export function HomeScreen({ onStart, onSample, onPrivacy }: Props) {
  return (
    <div className="screen home-screen">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="brand-row">
        <span className="brand-mark">W</span>
        <button className="text-button" type="button" onClick={onPrivacy}>隐私说明</button>
      </header>

      <div className="home-visual" aria-hidden="true">
        <div className="scan-frame">
          <span className="scan-corner top-left" />
          <span className="scan-corner top-right" />
          <span className="scan-corner bottom-left" />
          <span className="scan-corner bottom-right" />
          <div className="evidence-orbit orbit-one" />
          <div className="evidence-orbit orbit-two" />
          <div className="evidence-orbit orbit-three" />
        </div>
        <span className="visual-label">SCENE 00 / UNDISCOVERED</span>
      </div>

      <div className="home-copy">
        <p className="eyebrow">AI NATIVE MYSTERY</p>
        <h1>万物有戏</h1>
        <p className="hero-title">你的房间<br />藏着一个案件</p>
        <p className="hero-description">拍下一处普通空间，让 AI 利用眼前真实物品，生成一场三分钟悬疑解谜。</p>
      </div>

      <div className="action-stack">
        <button className="primary-button" type="button" onClick={onStart}>
          <span>开始扫描现场</span><span aria-hidden="true">↗</span>
        </button>
        <button className="secondary-button" type="button" onClick={onSample}>体验示例案件</button>
        <p className="privacy-note">照片仅用于本次体验，默认不会离开你的浏览器</p>
      </div>
    </div>
  );
}
