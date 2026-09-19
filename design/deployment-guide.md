# Vercel 部署指南

本文档记录当前 Aeon's End Digital Demo 的部署边界和 Vercel 配置。当前项目仍然是单机静态前端；如果只是本地开发，可以不配置 Vercel。

## 部署边界

- Vercel 只托管 Vue/Vite 生成的静态文件。
- 游戏规则在浏览器内运行，存档保存在玩家当前浏览器的 `localStorage`。
- 当前没有 API、数据库、账号、Webhook 或在线多人同步。
- 分享给朋友时只提供网站 URL，不提供 Vercel 项目权限或部署 Token。
- 项目中的 Aeon's End 素材属于当前 Demo 的测试素材，公开发布或商业化前必须重新确认版权和商标范围。

## 推荐项目配置

在 Vercel 导入 GitHub 仓库后，使用以下设置：

| 配置 | 值 |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `aeons-end-ui` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

由于 `aeons-end-ui/vite.config.ts` 通过 `@engine` 引用 `../aeons-end-engine/src`，而 `prebuild` 会执行 `../scripts/generate-image-imports.mjs`，必须允许构建阶段读取 Root Directory 外部的源码和脚本。Vercel 的 Monorepo 设置中打开 “Include source files outside of the Root Directory in the Build Step”。

图片资源也必须存在于远程 Git 提交中。根目录默认忽略图片文件，但 `friend-preview` 已对白名单中的 Wave 1 卡牌和 `image-database/common breach` 图片取消忽略；不要在 Vercel 上使用只包含本地图片的工作区快照。

## Vite SPA 路由

当前应用是单页应用。若直接刷新非根路径返回 404，在 `aeons-end-ui/vercel.json` 增加：

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

这个文件应在阶段二确认本地生产构建成功后再提交。

## 发布流程

1. 从已冻结的 `friend-preview` 分支创建 Preview Deployment。
2. 查看 Build Logs，确认图片生成脚本、引擎源码和 `dist` 都被正确处理。
3. 在 Preview URL 执行完整手动验收：Setup、Mage/Nemesis/Market 选择、两种 Nemesis、保存恢复、快捷键、图片加载和页面刷新。
4. 只有 Preview 通过后才创建 Production Deployment。
5. 保留上一版 Deployment，出现阻塞问题时优先回滚，不在生产环境临时修改代码。

## 本地复现生产构建

```powershell
cd aeons-end-engine
npm ci
npm test

cd ..\aeons-end-ui
npm ci
npx vue-tsc --noEmit
npm run build
npm run preview
```

`npm run preview` 用于检查本地生成的 `dist/`。不要提交 `node_modules/`、`dist/`、Playwright 输出、本地存档或 `.env` 文件。

## 常见问题

### 构建找不到 `@engine` 或图片生成脚本

检查 Root Directory 是否为 `aeons-end-ui`，并确认已允许构建阶段读取 Root Directory 外部文件。不要复制一份引擎源码到 UI 目录；项目必须继续使用共享的 `aeons-end-engine/src`。

### 页面可以打开，但刷新后出现 404

确认 `aeons-end-ui/vercel.json` 已加入 SPA rewrite，并重新部署 Preview。

### 朋友刷新后发现存档不存在

这是当前产品边界：存档只保存在同一浏览器的 `localStorage`。无痕窗口、清除网站数据或更换浏览器都会使存档不可用。

### 想隐藏 Ctrl+D

普通试玩版可以在发布前隐藏调试入口；即使隐藏，前端状态仍然可以被浏览器开发者工具修改，因此不能把客户端状态当作可信数据。内部测试 Preview 可以继续保留 Ctrl+D。

## 阶段三安全审计记录

- 当前仓库没有被 Git 跟踪的 `.env`、密钥、证书、凭据或 Token 文件。
- 前端没有应用 API、WebSocket、Cookie、账号或服务端请求；`localStorage` 只保存本地游戏状态和撤销历史。
- 引擎依赖审计通过；前端使用 `npm audit --omit=dev` 检查运行时依赖，结果为 0 个漏洞。
- 完整前端开发依赖仍报告 esbuild/Vite 开发服务器相关告警，当前审计结果显示暂无可用修复。它属于本地开发工具链，不会进入 Vercel 的静态运行时资源；Vite 配置已默认绑定 `127.0.0.1`，不要使用 `--host 0.0.0.0` 对外暴露开发服务器。
- 当前 `friend-preview` 保留 Ctrl+D，定位为信任朋友使用的测试 Preview；它不是权限控制，任何浏览器用户都可以修改客户端状态。若以后公开发布，应重新评估是否隐藏。
- GitHub 仓库是否为 Private 需要在 GitHub Settings 中由仓库所有者确认；本地环境无法可靠读取该远程设置。
- Aeon’s End 卡牌和角色图片的版权、商标和授权范围不由代码审计覆盖；当前只按非官方、非商业朋友试玩范围处理。

## 官方参考

- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel Monorepo FAQ](https://vercel.com/docs/monorepos/monorepo-faq)
- [Configuring a Build](https://vercel.com/docs/builds/configure-a-build)
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby)
