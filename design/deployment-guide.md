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

## 官方参考

- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel Monorepo FAQ](https://vercel.com/docs/monorepos/monorepo-faq)
- [Configuring a Build](https://vercel.com/docs/builds/configure-a-build)
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby)
