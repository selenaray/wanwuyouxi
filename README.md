# 万物有戏

把一张真实空间照片变成约 3 分钟的悬疑密室解谜：AI 从照片中选出三个可见物品，生成案件、线索和唯一答案，玩家探索后完成两次以内的推理。

## MVP 已实现

- 移动端优先的完整游戏流程，并保留无需模型额度的稳定示例案件
- 匿名会话、私有图片上传、异步生成任务和刷新恢复
- 通义千问视觉生成 + DeepSeek 语义复核，失败时可安全降级
- 服务端判题与真相保护，答案揭晓前不会下发到浏览器
- 图片主动删除、24 小时自动清理和不含图片/剧情的质量指标
- 63 项自动化测试、移动端端到端测试和生产构建验证

## 本地体验

需要 Node.js 20+ 和 pnpm。首次运行：

```bash
pnpm install
cp .env.example .env.local
pnpm dev --hostname 127.0.0.1 --port 3100
```

访问 `http://127.0.0.1:3100`，点击“体验示例案件”不需要任何 API Key。

真实照片生成还需要在另外两个终端运行：

```bash
pnpm worker
pnpm worker:cleanup
```

详细配置、安全说明和常见问题见 [本地后端运行指南](docs/development/backend-local-setup.md)。评估方式见 [MVP 质量评分表](docs/evaluation/backend-mvp-scorecard.md)。

## 验证

```bash
pnpm lint
pnpm test:run
pnpm build
pnpm test:e2e
```

真实模型测试默认跳过，只有明确设置 `RUN_LIVE_AI_TESTS=1` 才会产生模型调用费用。

## 隐私边界

- 图片不进入 `public/`，本地文件夹和阿里云 OSS 均按私有对象处理。
- DeepSeek 只接收结构化剧情语义，不接收原图、图片地址、坐标、会话或用户标识。
- 浏览器只保存任务和案件 ID，不保存照片地址、案件真相或正确答案。
- 指标仅允许状态、耗时、token、成本和错误码；图片地址与剧情字段会被拒绝。
- 用户重玩时立即请求删图，清理任务会继续处理失败重试和到期图片。
