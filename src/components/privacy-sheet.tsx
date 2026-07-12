export function PrivacySheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-backdrop">
      <section className="clue-sheet privacy-sheet" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
        <div className="sheet-handle" />
        <p className="eyebrow">YOUR SCENE, YOUR DATA</p>
        <h2 id="privacy-title">隐私说明</h2>
        <ul>
          <li>当前版本只使用模拟数据，不调用真实 AI。</li>
          <li>你选择的图片只生成浏览器本地预览，不会上传。</li>
          <li>刷新恢复只保存游戏进度，不保存照片内容。</li>
        </ul>
        <button className="primary-button" type="button" onClick={onClose}>我知道了</button>
      </section>
    </div>
  );
}
