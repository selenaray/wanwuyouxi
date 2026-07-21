# 万物有戏：本地后端运行指南

这份指南面向第一次运行项目的人。所有命令都在项目目录执行；API Key 只填写在电脑本地的 `.env.local`，不要发到聊天、截图或提交到 GitHub。

## 1. 两种运行方式

### 无额度演示

不填写模型 Key 时，后台自动使用固定的模拟生成器。它适合调试界面、面试演示兜底和自动化测试，不会产生费用。

### 真实 AI 生成

填写 `QWEN_API_KEY` 后，通义千问视觉读取照片并生成案件；填写 `DEEPSEEK_API_KEY` 后，DeepSeek 只复核结构化剧情。两项都填写时是完整流程。

默认模型：

- 通义千问：`qwen3-vl-plus`
- DeepSeek：`.env.local` 中配置的 `DEEPSEEK_MODEL`

## 2. 首次准备

```bash
pnpm install
cp .env.example .env.local
```

打开 `.env.local`，至少确认下面三行：

```dotenv
SESSION_SECRET=至少32位随机字符
QWEN_API_KEY=
DEEPSEEK_API_KEY=
```

留空两个 Key 就是无额度演示；真实模式请把 Key 粘贴在等号后。`.env.local` 已被 Git 忽略，仍不要把它复制进文档或聊天。

本地开发默认使用 `.data/pglite` 数据库和 `.data/uploads` 私有图片目录，无需安装 PostgreSQL。作品集低流量阶段也使用 PGlite，但只能运行一个应用实例，并必须把 `.data` 挂载到持久化云盘卷；照片使用私有 OSS。需要多副本或更高可用性时，先迁移到阿里云 RDS PostgreSQL，再进行横向扩容。正式上线步骤见 [阿里云香港 ECS 上线指南](../deployment/aliyun-hk-ecs.md)。

## 3. 启动完整流程

打开三个终端窗口。

终端一（网页与 API）：

```bash
pnpm dev --hostname 127.0.0.1 --port 3100
```

终端二（AI 生成任务）：

```bash
pnpm worker
```

终端三（图片到期清理）：

```bash
pnpm worker:cleanup
```

浏览器打开 `http://127.0.0.1:3100`。首次真实生成建议使用一张自己有权使用、没有人脸和隐私文字的室内照片。

## 4. 图片和任务生命周期

1. 浏览器把可解码图片压缩到最长边不超过 1600 像素、JPEG 质量 0.82。
2. 服务端重新解码并清洗图片，存入非公开目录或私有 OSS。
3. API 立即返回任务 ID；Worker 在后台生成，网页轮询约 30 秒后停止显式等待。
4. 刷新页面可凭任务 ID 恢复，不会把照片地址或答案写入浏览器存储。
5. 用户重玩会请求立即删除；默认最迟 24 小时后由清理 Worker 删除。删除失败会在下一轮重试，案件文本仍保留。

## 5. 阿里云 OSS 配置（部署阶段）

将以下值只填在部署平台的加密环境变量中：

```dotenv
IMAGE_STORAGE_DRIVER=oss
OSS_REGION=
OSS_BUCKET=
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
```

Bucket 必须为私有读写，不要开启公共读。应用签名地址有效期上限为 300 秒。正式环境建议使用最小权限 RAM 用户，并限制为指定 Bucket 的读、写、删权限。

## 6. 验证命令

```bash
pnpm lint
pnpm test:run
pnpm build
pnpm test:e2e
```

真实模型测试会产生少量费用，只有得到明确许可后再运行：

```bash
RUN_LIVE_AI_TESTS=1 pnpm test:live-ai
```

## 7. 常见问题

- 页面能打开但一直生成：确认 `pnpm worker` 所在终端仍在运行。
- 刷新后看到失败页：后台任务仍可能继续；返回首页重新进入，或查看 Worker 是否报告了不含隐私内容的错误码。
- `QWEN_AUTH_FAILED` / `DEEPSEEK_AUTH_FAILED`：检查本地 Key 是否有效，不要把 Key 贴到终端命令或聊天中。
- `RATE_LIMITED`：等待额度恢复后重试；系统不会无限调用模型。
- HEIC 无法处理：在手机相机兼容模式下导出 JPEG 后重试。
- 照片被拒绝：换一张光线更清楚、至少含三个可辨识物品、没有人物或敏感内容的室内照片。

## 8. Key 轮换

1. 在供应商控制台创建新 Key。
2. 只替换 `.env.local` 或部署平台加密变量中的值。
3. 重启网页、生成 Worker 和清理 Worker。
4. 运行一次受控测试，确认成功后在供应商控制台撤销旧 Key。
5. 若 Key 曾出现在聊天、截图、日志或 Git 历史中，应立即撤销，不要只删除文本。
