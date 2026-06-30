# Design Studio AI

这是一个面向服装款式开发、花型设计、产品图与矢量图生成的本地演示应用。  
默认页面分为两层：

- 客户演示页：`/`（即 `public/customer.html`）
- 工作台页面：`/index.html`

## 本地运行

Windows 下可直接双击启动：

```text
start-app.bat
```

或执行：

```powershell
npm start
```

然后打开：

- 客户演示页：`http://localhost:5173/`
- 工作台：`http://localhost:5173/index.html`

## 一键部署脚本（推荐）

我们新增了 Windows 一键脚本：`deploy-github-render.bat`

脚本会按步骤完成：

- 检测仓库与 `main` 分支
- 提交本次修改
- 配置 `origin` 并推送到 GitHub
- 可选打开 Render 控制台

> 说明：脚本不自动创建 GitHub 仓库和 Render 服务（涉及登录和权限确认），
> 但会把可自动化的“提交+推送”动作一次完成。

## 部署到 Render（建议）

1. 在 GitHub 创建仓库（推荐 `design-studio-ai`，私有或公开都可）。
2. 运行 `deploy-github-render.bat`，按提示填提交说明和仓库地址。
3. 在 Render 打开：  
   - New → Web Service  
   - 连接 GitHub 仓库  
   - Start Command 填：`node server.js`  
4. 配置环境变量：

```text
OPENAI_API_KEY=你的 key
OPENAI_TEXT_MODEL=gpt-5.5
OPENAI_IMAGE_MODEL=gpt-image-2
PORT=5173
```

5. 上线后打开 Render 给的域名，测试：

```text
https://你的服务名.onrender.com/
```

## 环境变量文件

项目默认示例文件 `.env.example` 中提供：

```text
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=gpt-5.5
OPENAI_IMAGE_MODEL=gpt-image-2
PORT=5173
```

建议始终使用 `.env` 覆盖敏感信息，不要提交到仓库。

## 当前状态（已完成）

- 客户演示页（可发给客户）
- 工作台生成接口（支持 OpenAI 或演示模式回退）
- 客户反馈提交接口：`POST /api/feedback`
- 反馈落库到 `data/feedback.jsonl`（本地示例）
