import type { ChangeEvent } from "react";

type Props = {
  imageUrl: string | null;
  imageName: string | null;
  onSelect: (file: File) => void;
  onConfirm: () => void;
  onBack: () => void;
};

export function CaptureScreen({ imageUrl, imageName, onSelect, onConfirm, onBack }: Props) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onSelect(file);
  };

  return (
    <div className="screen capture-screen">
      <header className="top-bar">
        <button className="icon-button" type="button" onClick={onBack} aria-label="返回首页">←</button>
        <span>建立现场</span>
        <span className="step-label">01 / 03</span>
      </header>

      <div className="capture-copy">
        <p className="eyebrow">CAPTURE THE SCENE</p>
        <h2>{imageUrl ? "确认你的现场" : "让线索有处可藏"}</h2>
        <p>{imageUrl ? "照片只保存在当前浏览器中。确认后将模拟 AI 分析过程。" : "请拍摄包含五个以上物品的桌面、房间或咖啡馆角落。"}</p>
      </div>

      <div className={`camera-frame ${imageUrl ? "has-image" : ""}`}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="待扫描的现场照片" />
        ) : (
          <div className="camera-empty">
            <div className="focus-reticle" aria-hidden="true">＋</div>
            <strong>对准一处物品丰富的空间</strong>
            <span>避免人脸、证件和聊天记录</span>
          </div>
        )}
        <span className="frame-corner corner-a" /><span className="frame-corner corner-b" />
        <span className="frame-corner corner-c" /><span className="frame-corner corner-d" />
      </div>

      {imageName && <p className="file-name"><span>已选择</span>{imageName}</p>}

      <div className="capture-tips">
        <span>光线充足</span><span>物品清晰</span><span>空间完整</span>
      </div>

      <div className="action-stack compact">
        <label className="secondary-button file-button">
          <span>{imageUrl ? "重新选择" : "选择现场照片"}</span>
          <input aria-label="选择现场照片" type="file" accept="image/jpeg,image/png,image/heic,image/heif" onChange={handleChange} />
        </label>
        {imageUrl && <button className="primary-button" type="button" onClick={onConfirm}>使用这张照片 <span aria-hidden="true">↗</span></button>}
      </div>
    </div>
  );
}
