# GitHub + Render 部署步骤

目标：把本地演示版变成客户能打开的公网链接。

## 你最终会得到什么

部署完成后会得到一个类似这样的链接：

```text
https://design-studio-ai.onrender.com
```

客户打开后先看到客户演示页，点击“立即体验演示版”进入设计工作台。

## 方式一：GitHub 网页上传，最适合新手

### 1. 创建 GitHub 仓库

1. 打开 GitHub。
2. 点击右上角 `+`。
3. 选择 `New repository`。
4. Repository name 填：

```text
design-studio-ai
```

5. 选择 `Private` 或 `Public` 都可以。
6. 点击 `Create repository`。

### 2. 上传项目文件

在 GitHub 新仓库页面点击：

```text
uploading an existing file
```

然后上传当前项目里的这些文件和文件夹：

```text
public/
server.js
package.json
Dockerfile
render.yaml
railway.json
.dockerignore
.env.example
README.md
部署上线说明.md
客户反馈表.md
使用说明.md
```

不要上传：

```text
.env
.git
.agents
node_modules
```

上传完成后点击：

```text
Commit changes
```

## 方式二：命令上传，适合熟悉 Git 的情况

在项目目录执行：

```powershell
git init
git add .
git commit -m "Initial customer demo"
git branch -M main
git remote add origin 你的GitHub仓库地址
git push -u origin main
```

如果电脑没有安装 Git，可以先用方式一。

## Render 部署

### 1. 新建 Web Service

1. 打开 Render。
2. 点击 `New +`。
3. 选择 `Web Service`。
4. 连接 GitHub。
5. 选择 `design-studio-ai` 仓库。

### 2. 设置部署参数

Render 页面里按下面填写：

```text
Name: design-studio-ai
Environment: Node
Build Command: 留空
Start Command: node server.js
```

如果 Render 要求端口，项目会自动读取 `PORT`，不用手动改代码。

### 3. 环境变量

第一版演示可以不填 API Key，系统会进入演示模式。

如果要接真实模型，再添加：

```text
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_TEXT_MODEL=gpt-5.5
OPENAI_IMAGE_MODEL=gpt-image-2
```

### 4. 部署成功后

Render 会给你一个公网链接，例如：

```text
https://design-studio-ai.onrender.com
```

把这个链接发给客户即可。

## 发客户前你要检查

1. 首页能打开。
2. 点击“立即体验演示版”能进入工作台。
3. 点击“填入示例”正常。
4. 点击“生成设计方案”正常。
5. 页面没有乱码。
6. 手机端也能正常打开。

## 发客户的话术

```text
这是我们正在内测的 AI 服装开发工作台演示版。
目前可以体验：款式方向、花型方向、产品图提示词、英文上架文案生成。
正式版会继续支持上传样衣、生成产品图、保存项目和交付文件。
你可以先试一下流程，重点帮我看：哪个功能对你最有用、还有哪里不清楚。
```

## 客户反馈重点

客户试完后，优先问这三个问题：

1. 你最想用哪个功能？
2. 你愿意上传什么素材？
3. 你希望最终下载什么文件？

这三个答案决定下一版先开发什么。
