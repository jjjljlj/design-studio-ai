# 多模型测试方案

目标：把“样衣到上架素材工作台”拆成文本生成和图片生成两条线，分别测试效果和成本。

## 推荐第一阶段组合

- 文本生成：DeepSeek
  - 用途：样衣分析、产品图提示词、英文 Listing、TK 脚本、客户缺失资料。
  - 环境变量：`TEXT_PROVIDER=deepseek`
  - Key：`DEEPSEEK_API_KEY`
  - 模型：`DEEPSEEK_TEXT_MODEL=deepseek-chat`

- 图片生成：OpenAI 或 Qwen
  - OpenAI 用途：产品主图、模特图、详情图预览。
  - 环境变量：`IMAGE_PROVIDER=openai`
  - Key：`OPENAI_API_KEY`
  - 模型：`OPENAI_IMAGE_MODEL=gpt-image-2`

  - Qwen / DashScope 用途：测试国产生图成本和速度。
  - 环境变量：`IMAGE_PROVIDER=qwen`
  - Key：`QWEN_API_KEY` 或 `DASHSCOPE_API_KEY`
  - 模型：`QWEN_IMAGE_MODEL=wanx2.1-t2i-turbo`

## 自动模式

也可以设置：

```text
TEXT_PROVIDER=auto
IMAGE_PROVIDER=auto
```

自动选择顺序：

- 文本：DeepSeek -> Qwen -> OpenAI -> demo
- 图片：OpenAI -> Qwen -> demo

## Render 需要添加的 Key

最少可先填：

```text
TEXT_PROVIDER=deepseek
IMAGE_PROVIDER=openai
DEEPSEEK_API_KEY=你的 DeepSeek key
OPENAI_API_KEY=你的 OpenAI key
```

如果想测试 Qwen 生图，再填：

```text
IMAGE_PROVIDER=qwen
QWEN_API_KEY=你的 DashScope key
QWEN_IMAGE_MODEL=wanx2.1-t2i-turbo
```

## 怎么判断效果

每个样衣用同一份资料跑三轮：

1. DeepSeek 文本 + OpenAI 生图
2. Qwen 文本 + Qwen 生图
3. OpenAI 文本 + OpenAI 生图

记录：

- 生成速度
- 文案自然度
- 图片是否保持样衣细节
- 是否适合直接给客户看
- 单次成本

第一阶段建议先把“文本方案质量”和“客户是否愿意继续沟通”作为核心指标，不急着追求全自动上架。
