# 万物有戏：阿里云香港 ECS 上线指南

这套方案面向作品集和小规模公开体验：一台香港 ECS 运行一个应用实例，PGlite 数据保存在独立云盘卷中，照片进入私有 OSS，Caddy 自动申请和续期 HTTPS 证书。不要启动多个应用副本；需要横向扩容时应先把数据库迁移到 RDS PostgreSQL。

## 1. 准备服务器与域名

购买香港地域、Ubuntu 系统、至少 2 vCPU / 2 GB 内存且带公网 IP 的 ECS。安全组只开放 SSH（建议仅允许自己的 IP）、TCP 80 和 TCP/UDP 443，不要开放应用的 3000 端口。

在域名服务商处添加 A 记录，把准备使用的子域名指向 ECS 公网 IP。等待解析生效后再启动 Caddy，否则 HTTPS 证书申请会失败。

## 2. 安装 Docker

登录 ECS，按照 Docker 官方 Ubuntu 指南安装 Docker Engine 与 Compose 插件。完成后确认：

```bash
docker version
docker compose version
```

## 3. 获取代码并配置秘密

```bash
git clone https://github.com/selenaray/wanwuyouxi.git
cd wanwuyouxi
cp deploy/.env.production.example deploy/.env.production
openssl rand -base64 48
```

将最后一条命令的输出填入服务器文件 `deploy/.env.production` 的 `SESSION_SECRET`。同时填写域名、模型 Key 和私有 OSS 配置。这个文件已被 Git 和 Docker 构建上下文忽略；不要把内容发到聊天、截图、日志或提交到仓库。

OSS Bucket 必须设为私有，RAM 用户只授予指定 Bucket 所需的读、写、删权限。应用启动时会检查必需配置，只报告缺失字段名，不打印秘密值。

## 4. 首次上线与验证

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env.production up -d --build
docker compose -f deploy/compose.yml --env-file deploy/.env.production ps
curl -fsS "https://你的域名/api/health"
```

健康接口应返回 `{"ok":true}`。随后用手机访问 HTTPS 地址，先完成示例案件，再用一张不含人脸、证件或聊天记录的照片测试真实生成。每天每位匿名访客默认最多创建 3 个真实案件。

排查时查看经过应用清洗的日志，不要复制环境变量：

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env.production logs --tail=200 app
docker compose -f deploy/compose.yml --env-file deploy/.env.production logs --tail=200 caddy
```

## 5. 备份

每次更新前先备份持久化数据库卷：

```bash
mkdir -p backups
docker run --rm -v wanwuyouxi-data:/data -v "$PWD/backups:/backup" alpine sh -c 'tar czf /backup/pglite-$(date +%Y%m%d-%H%M%S).tgz -C /data .'
```

把备份复制到 ECS 以外的安全位置。备份包含游戏数据，不包含 OSS 中的原始照片。

## 6. 更新

先执行上一节备份，然后：

```bash
git pull --ff-only
docker compose -f deploy/compose.yml --env-file deploy/.env.production up -d --build
docker compose -f deploy/compose.yml --env-file deploy/.env.production ps
curl -fsS "https://你的域名/api/health"
```

推荐先在当前分支完成自动化测试，再合并和部署同一个 commit，保证验证过的代码与上线代码一致。

## 7. 回滚

记录更新前的 commit。需要回滚时切换到上一个确认可用的 commit 并重新构建：

```bash
git log --oneline -10
git checkout 上一个可用的提交哈希
docker compose -f deploy/compose.yml --env-file deploy/.env.production up -d --build
curl -fsS "https://你的域名/api/health"
```

回滚时绝对不要执行 `docker compose down -v`，也不要删除 `wanwuyouxi-data` volume。数据库结构出现不兼容升级前，必须额外制定数据迁移与恢复方案。

## 8. Key 泄露处理

如果模型或 OSS Key 出现在聊天、截图、日志或 Git 历史中，先到对应供应商控制台撤销旧 Key，再创建最小权限的新 Key，更新服务器上的 `deploy/.env.production`，最后重启应用：

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env.production up -d --force-recreate app
```

删除泄露文本不能代替撤销 Key。`SESSION_SECRET` 泄露时也要立即更换；这会让现有匿名会话失效，用户需要重新开始体验。
