const moduleLabels = {
  sample: "样衣分析",
  image: "图片规划",
  listing: "上架文案",
  tiktok: "TK短视频"
};

const moduleDeliverables = {
  sample: "sample analysis, selling points, target customer, missing inputs, next actions",
  image: "main image plan, white background image, model image, lifestyle image, detail image, ad image prompts",
  listing: "English ecommerce title, five bullets, long description, keywords, size and care notes",
  tiktok: "three 15-30 second TikTok scripts, hooks, shots, English voiceover, captions and editing notes"
};

let activeModule = "sample";
let latestResult = null;

const form = document.querySelector("#briefForm");
const resultMain = document.querySelector("#resultMain");
const moduleTitle = document.querySelector("#moduleTitle");
const toast = document.querySelector("#toast");
const assetInput = document.querySelector("#assetInput");
const assetPreview = document.querySelector("#assetPreview");
const apiStatus = document.querySelector("#apiStatus");
const textProviderLabel = document.querySelector("#textProviderLabel");
const imageProviderLabel = document.querySelector("#imageProviderLabel");
const textModelName = document.querySelector("#textModelName");
const imageModelName = document.querySelector("#imageModelName");
const keyStatusLabel = document.querySelector("#keyStatusLabel");
const modelAdvice = document.querySelector("#modelAdvice");
const refreshStatus = document.querySelector("#refreshStatus");

const providerNames = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  qwen: "千问/通义",
  demo: "演示模式",
  auto: "自动选择"
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function providerName(provider) {
  return providerNames[String(provider || "").toLowerCase()] || provider || "未配置";
}

function updateRuntimeView(status) {
  const textProvider = providerName(status?.textProvider);
  const imageProvider = providerName(status?.imageProvider);
  const configured = status?.configured || {};
  const textModels = status?.textModels || {};
  const imageModels = status?.imageModels || {};

  apiStatus.textContent = `${textProvider} / ${imageProvider}`;
  if (textProviderLabel) textProviderLabel.textContent = textProvider;
  if (imageProviderLabel) imageProviderLabel.textContent = imageProvider;
  if (textModelName) {
    const model = textModels[status?.textProvider] || textModels.openai || textModels.deepseek || "待配置";
    textModelName.textContent = `当前文本模型：${model}`;
  }
  if (imageModelName) {
    const model = imageModels[status?.imageProvider] || imageModels.openai || imageModels.qwen || "待配置";
    imageModelName.textContent = `当前图片模型：${model}`;
  }
  if (keyStatusLabel) {
    const keyParts = [
      `OpenAI ${configured.openai ? "已配置" : "待配置"}`,
      `DeepSeek ${configured.deepseek ? "已配置" : "待配置"}`,
      `千问 ${configured.qwen ? "已配置" : "待接入"}`
    ];
    keyStatusLabel.textContent = keyParts.join(" / ");
  }
  if (modelAdvice) {
    modelAdvice.textContent = configured.deepseek
      ? "文案走 DeepSeek"
      : configured.openai
        ? "文案走 OpenAI"
        : "当前为演示模式";
  }
}

function setModule(module) {
  activeModule = module;
  moduleTitle.textContent = moduleLabels[module];
  document.querySelectorAll("[data-module]").forEach((button) => {
    button.classList.toggle("active", button.dataset.module === module);
  });
}

document.querySelectorAll("[data-module]").forEach((button) => {
  button.addEventListener("click", () => setModule(button.dataset.module));
});

async function loadRuntimeStatus() {
  if (window.location.protocol === "file:") {
    updateRuntimeView({
      textProvider: "demo",
      imageProvider: "demo",
      textModels: {},
      imageModels: {},
      configured: {}
    });
    return;
  }

  try {
    const response = await fetch("/api/status");
    if (!response.ok) throw new Error("status request failed");
    const status = await response.json();
    updateRuntimeView(status);
  } catch {
    apiStatus.textContent = "待检测";
  }
}

loadRuntimeStatus();

refreshStatus?.addEventListener("click", async () => {
  await loadRuntimeStatus();
  showToast("模型状态已刷新");
});

document.querySelector("#fillDemo").addEventListener("click", () => {
  form.customer.value = "US boutique womenswear buyer";
  form.category.value = "women's printed midi dress";
  form.market.value = "US";
  form.platform.value = "TikTok Shop";
  form.season.value = "Spring / Summer";
  form.material.value = "lightweight woven fabric, soft drape, breathable handfeel";
  form.colors.value = "sage green base, ivory micro floral, soft coral accent";
  form.style.value = "resort, everyday feminine, easy vacation outfit";
  form.productNotes.value =
    "Keep the midi length, V neckline, short flutter sleeves, waist seam and small floral print. Do not add logo. Need marketplace image plan, listing copy, and TikTok content for first test.";
  form.sizeStatus.value = "暂无尺码表";
  form.stage.value = "准备投放 TK 内容";
  showToast("示例资料已填入");
});

assetInput.addEventListener("change", () => {
  assetPreview.innerHTML = "";
  [...assetInput.files].slice(0, 8).forEach((file) => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    assetPreview.appendChild(img);
  });
});

function formPayload() {
  const data = Object.fromEntries(new FormData(form).entries());
  const notes = [
    data.productNotes,
    `Target platform: ${data.platform || "not specified"}`,
    `Size status: ${data.sizeStatus || "not specified"}`,
    `Business stage: ${data.stage || "not specified"}`,
    `Uploaded reference image count: ${assetInput.files.length}`
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ...data,
    productNotes: notes,
    module: moduleLabels[activeModule],
    deliverables: moduleDeliverables[activeModule],
    assetCount: assetInput.files.length
  };
}

function mockDesign(payload) {
  const category = payload.category || "women's fashion item";
  const market = payload.market || "US";
  const platform = payload.platform || "TikTok Shop";

  return {
    mode: "demo",
    provider: "demo",
    summary: `已为 ${market} 市场生成一版“样衣到上架素材”的执行方案，可用于客户确认、图片生成和上架准备。`,
    conceptName: "Sample-to-Sell Launch Pack",
    positioning: [
      `${category} 先定位为轻商业测试款，重点验证主图点击、上身效果和短视频前 3 秒吸引力。`,
      `平台优先级建议：${platform} 先做快速内容测试，再把表现好的图片和卖点复用到其他渠道。`,
      "当前阶段先不要追求复杂功能，先拿到客户确认：款式方向、图片风格、英文卖点和补充资料。"
    ],
    designDirections: [
      {
        name: "Direction A - Clean Marketplace Hero",
        details: "主图保持干净、真实、易判断版型。模特正面自然站姿，商品轮廓清晰，背景减少干扰，用于提升首屏信任感。",
        risk: "需要补充样衣正反面图和细节图，避免生成图改变领口、袖型、长度、颜色或印花位置。"
      },
      {
        name: "Direction B - Lifestyle Conversion Scene",
        details: "围绕通勤、度假或周末出行场景展示上身效果，让客户看到真实穿搭用途，适合详情页和广告图。",
        risk: "不要加入未经授权品牌、地标、明星脸或虚假折扣文字。"
      },
      {
        name: "Direction C - TikTok Hook Test",
        details: "短视频先测 3 个角度：显瘦/舒适、场景穿搭、细节近拍。每条 15-30 秒，重点看前 3 秒留存和点击。",
        risk: "不要承诺 100% 显瘦、永久不皱、不起球等无法验证的效果。"
      }
    ],
    imagePrompts: [
      {
        usage: "main image",
        ratio: "4:5",
        prompt: `Professional ecommerce model photo for ${category}, natural daylight studio, clean neutral background, accurate garment color and silhouette, realistic fabric texture, full outfit visible, marketplace-ready composition`,
        negative: "do not change garment color, no extra logo, no brand text, no distorted hands, no wrong neckline, no incorrect sleeve shape, no messy garment structure"
      },
      {
        usage: "lifestyle image",
        ratio: "4:5",
        prompt: `Lifestyle fashion photo for ${category}, bright street or vacation setting, natural movement, clear garment fit, authentic overseas ecommerce look, soft daylight, premium but realistic styling`,
        negative: "no luxury brand reference, no celebrity face, no fake review text, no unreadable typography, no over-edited skin"
      },
      {
        usage: "TikTok cover",
        ratio: "9:16",
        prompt: `Vertical TikTok cover image for ${category}, model mid-motion, clear front view, strong outfit silhouette, space for short English headline, bright clean composition`,
        negative: "no wrong text, no watermark, no logo, no extra accessories that hide the product"
      }
    ],
    vectorPrompt:
      "Create a clean editable textile vector artwork based on the product print direction, organized layers, flat colors, seamless repeat option, no brand marks, suitable for digital printing and colorway expansion.",
    listingCopy: {
      title: "Women Printed Midi Dress, Lightweight Casual Vacation Dress for Spring Summer Outfits",
      bullets: [
        "Easy everyday style designed for travel, brunch, weekend plans, and warm-weather outfits.",
        "Lightweight woven handfeel creates a soft, comfortable look without feeling too formal.",
        "Clean silhouette pairs well with sandals, sneakers, light jackets, and simple accessories.",
        "Small print direction adds visual interest while staying wearable for daily styling.",
        "Please check the size chart before ordering; manual measurement may vary slightly."
      ],
      keywords: [
        "women midi dress",
        "printed dress",
        "summer dress",
        "vacation dress",
        "casual dress",
        "floral dress",
        "spring outfit",
        "resort wear",
        "travel outfit",
        "weekend dress",
        "boutique dress",
        "lightweight dress",
        "women fashion",
        "TikTok outfit",
        "ecommerce fashion",
        "model photo",
        "lifestyle image",
        "product photo",
        "fashion listing",
        "women clothing",
        "daily wear",
        "soft dress",
        "comfortable dress",
        "gift for women",
        "work casual",
        "holiday outfit",
        "street style",
        "fashion content",
        "main image",
        "detail image"
      ]
    },
    tiktokScripts: [
      {
        hook: "This is the dress I pack when I do not want to overthink an outfit.",
        shots: ["0-3s front mirror movement", "4-10s close-up fabric and print", "11-20s walking shot", "21-28s styling with bag and sandals"],
        caption: "Easy vacation outfit, no overthinking.",
        voiceover: "Light, easy, and ready in one piece. This dress works for brunch, travel, and warm weekend plans."
      },
      {
        hook: "One dress, three simple ways to wear it.",
        shots: ["show base dress", "add light cardigan", "switch to sneakers", "detail close-up"],
        caption: "3 ways to style one printed dress.",
        voiceover: "Keep it casual with sneakers, dress it up with sandals, or layer it for cooler evenings."
      },
      {
        hook: "The print is subtle, but it makes the whole outfit feel finished.",
        shots: ["print close-up", "waist and neckline detail", "full-body pose", "final product hero shot"],
        caption: "Small print, easy outfit.",
        voiceover: "A soft print gives the look personality without feeling too loud for everyday wear."
      }
    ],
    nextInputsNeeded: [
      "样衣正面、背面、侧面和细节照片",
      "面料成分、克重、弹力和是否透光",
      "尺码表和模特身高体重参考",
      "目标售价、成本区间和主要竞品",
      "客户最想先测试的平台和预算"
    ]
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function list(items = []) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderScripts(scripts = []) {
  if (!scripts.length) {
    return `
      <div class="result-block">
        <h3>TK 短视频脚本</h3>
        <p>当前模型未返回脚本字段。建议下一版补充：3 秒钩子、分镜、英文口播、字幕和剪辑建议。</p>
      </div>
    `;
  }

  return `
    <div class="result-block">
      <h3>TK 短视频脚本</h3>
      <div class="prompt-grid">
        ${scripts
          .map(
            (script, index) => `
              <div class="prompt-box">
                <p><strong>Script ${index + 1}</strong></p>
                <p><strong>Hook:</strong> ${escapeHtml(script.hook)}</p>
                ${list(script.shots || [])}
                <p><strong>Voiceover:</strong> ${escapeHtml(script.voiceover)}</p>
                <p><strong>Caption:</strong> ${escapeHtml(script.caption)}</p>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderResult(data) {
  latestResult = data;
  const metaItems = [
    data.mode ? `运行模式：${data.mode === "live" ? "正式模型" : "演示输出"}` : "",
    data.provider ? `文本模型：${providerName(data.provider)}` : "",
    data.generatedAt ? `生成时间：${data.generatedAt}` : ""
  ].filter(Boolean);

  const directions = (data.designDirections || [])
    .map(
      (item, index) => `
        <div class="result-block direction-card">
          <span class="card-index">0${index + 1}</span>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.details)}</p>
          <p class="risk-note"><strong>风险提醒：</strong>${escapeHtml(item.risk)}</p>
        </div>`
    )
    .join("");

  const prompts = (data.imagePrompts || [])
    .map(
      (item) => `
        <div class="prompt-box">
          <p><strong>${escapeHtml(item.usage)}</strong> · ${escapeHtml(item.ratio)}</p>
          <p>${escapeHtml(item.prompt)}</p>
          <p><strong>Negative:</strong> ${escapeHtml(item.negative)}</p>
        </div>`
    )
    .join("");

  resultMain.innerHTML = `
    <div class="result-content">
      <div class="result-block concept-card">
        <span class="card-index">AI</span>
        ${metaItems.length ? `<div class="result-meta">${metaItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        <h3>${escapeHtml(data.conceptName || "Sample-to-Sell Launch Pack")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        ${list(data.positioning || [])}
      </div>

      <div class="prompt-grid">${directions}</div>

      <div class="result-block">
        <h3>图片生成清单</h3>
        <div class="prompt-grid">${prompts}</div>
      </div>

      <div class="result-block">
        <h3>数码矢量图提示词</h3>
        <p>${escapeHtml(data.vectorPrompt || "")}</p>
      </div>

      <div class="result-block">
        <h3>英文上架内容</h3>
        <p><strong>Title:</strong> ${escapeHtml(data.listingCopy?.title || "")}</p>
        ${list(data.listingCopy?.bullets || [])}
      </div>

      <div class="result-block">
        <h3>搜索关键词</h3>
        <div class="tag-cloud">
          ${(data.listingCopy?.keywords || []).map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}
        </div>
      </div>

      ${renderScripts(data.tiktokScripts || [])}

      <div class="result-block">
        <h3>还需要客户补充</h3>
        ${list(data.nextInputsNeeded || [])}
      </div>
    </div>
  `;
}

async function requestDesign(payload) {
  if (window.location.protocol === "file:") {
    return mockDesign(payload);
  }

  try {
    const response = await fetch("/api/generate/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "生成失败");
    return data;
  } catch (error) {
    console.warn(error);
    return mockDesign(payload);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector(".primary-action");
  submit.disabled = true;
  submit.querySelector("span").textContent = "生成中...";

  try {
    const data = await requestDesign(formPayload());
    renderResult(data);
    apiStatus.textContent = data.mode === "demo" ? "演示输出" : `已连接 ${providerName(data.provider)}`;
    showToast("素材包方案已生成");
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = "生成素材包方案";
  }
});

document.querySelector("#copyResult").addEventListener("click", async () => {
  if (!latestResult) {
    showToast("还没有可复制的结果");
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify(latestResult, null, 2));
  showToast("结果已复制");
});

document.querySelector("#generateImage").addEventListener("click", async () => {
  const prompt = latestResult?.imagePrompts?.[0]?.prompt;
  if (!prompt) {
    showToast("请先生成素材包方案");
    return;
  }

  if (window.location.protocol === "file:") {
    resultMain.insertAdjacentHTML(
      "afterbegin",
      `<div class="result-content generated-image">
        <div class="image-placeholder">当前是本地文件预览模式。启动服务并配置 OPENAI_API_KEY 后，这里会显示真实生成图片。</div>
        <div class="result-block">
          <h3>使用的提示词</h3>
          <p>${escapeHtml(prompt)}</p>
        </div>
      </div>`
    );
    showToast("已生成图片占位预览");
    return;
  }

  showToast("正在生成主图预览");
  try {
    const response = await fetch("/api/generate/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, size: "1024x1536", quality: "medium" })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "图片生成失败");

    const imageHtml = data.image
      ? `<img src="${data.image}" alt="Generated product visual" />`
      : `<div class="image-placeholder">演示模式未生成真实图片。配置 OPENAI_API_KEY 后，这里会显示模型生成的产品图。</div>`;

    resultMain.insertAdjacentHTML(
      "afterbegin",
      `<div class="result-content generated-image">
        ${imageHtml}
        <div class="result-block">
          <h3>使用的提示词</h3>
          <p>${escapeHtml(data.prompt)}</p>
          ${data.note ? `<p>${escapeHtml(data.note)}</p>` : ""}
        </div>
      </div>`
    );
  } catch (error) {
    showToast(error.message);
  }
});
