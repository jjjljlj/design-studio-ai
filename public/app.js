const moduleLabels = {
  style: "款式开发",
  pattern: "花型设计",
  product: "产品图生成",
  vector: "数码矢量图"
};

const moduleDeliverables = {
  style: "style concept, silhouette development, ecommerce listing copy",
  pattern: "repeat pattern direction, colorways, textile print prompt",
  product: "model photo prompt, lifestyle image prompt, marketplace image plan",
  vector: "clean vector tracing prompt, layered SVG direction, print-ready artwork brief"
};

let activeModule = "style";
let latestResult = null;

const form = document.querySelector("#briefForm");
const resultMain = document.querySelector("#resultMain");
const moduleTitle = document.querySelector("#moduleTitle");
const toast = document.querySelector("#toast");
const assetInput = document.querySelector("#assetInput");
const assetPreview = document.querySelector("#assetPreview");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
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

document.querySelector("#fillDemo").addEventListener("click", () => {
  form.customer.value = "US boutique womenswear buyer";
  form.category.value = "women's printed midi dress";
  form.market.value = "US";
  form.season.value = "Spring / Summer";
  form.material.value = "lightweight woven fabric, soft drape, breathable handfeel";
  form.style.value = "resort, everyday feminine, easy vacation outfit";
  form.colors.value = "sage green base, ivory micro floral, soft coral accent";
  form.productNotes.value =
    "Need 3 commercial directions for quick sampling. Keep the shape wearable, avoid luxury brand references, prepare prompts for model images, lifestyle ads, seamless floral print and editable vector artwork.";
  showToast("示例需求已填入");
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
  return {
    ...data,
    module: moduleLabels[activeModule],
    deliverables: moduleDeliverables[activeModule],
    assetCount: assetInput.files.length
  };
}

function mockDesign(payload) {
  const category = payload.category || "women's fashion top";
  return {
    mode: "demo",
    summary: "已生成一版可用于客户沟通、图片生成和上架准备的设计方案。",
    conceptName: "Soft Utility Resort Capsule",
    positioning: [
      `面向 ${payload.market || "US"} 市场的轻商业款式，适合快速打样和平台测试。`,
      "视觉重点放在上身效果、面料垂感、花型清晰度和可批量延展性。",
      "先用 3 个方向做客户选择，再确定版型、色组和图案密度。"
    ],
    designDirections: [
      {
        name: "Clean Everyday Fit",
        details: `${category} 保持简洁轮廓，突出舒适、百搭、易搭配，适合作为主推基础款。`,
        risk: "需要补充尺码表和面料克重，避免后续客户对版型预期不一致。"
      },
      {
        name: "Botanical Micro Print",
        details: "采用小面积植物花型，适合连衣裙、上衣、家居服和度假系列延展。",
        risk: "花型必须避开现有品牌图案和版权图库素材。"
      },
      {
        name: "Marketplace Hero Image",
        details: "主图用干净模特图，详情页补充面料、版型、场景和细节卖点。",
        risk: "生成图必须锁定样衣颜色、领口、袖型、长度和印花位置。"
      }
    ],
    imagePrompts: [
      {
        usage: "main image",
        ratio: "4:5",
        prompt: `Professional ecommerce model photo for ${category}, natural daylight studio, clean background, realistic fabric texture, accurate garment structure, relaxed confident pose, high detail, marketplace-ready composition`,
        negative: "do not change garment color, no extra logo, no brand text, no distorted hands, no wrong buttons, no messy seams"
      },
      {
        usage: "social ad",
        ratio: "9:16",
        prompt: `TikTok-style lifestyle product shot for ${category}, casual movement, real street or bright home setting, clear full outfit, natural expression, commercial fashion photography`,
        negative: "no luxury brand reference, no celebrity face, no fake discount text, no unreadable typography"
      }
    ],
    vectorPrompt: "Create a clean seamless botanical vector repeat, editable flat colors, organized layers, no brand marks, suitable for textile digital printing and colorway expansion.",
    listingCopy: {
      title: "Women Casual Printed Top, Soft Everyday Blouse for Work, Travel and Weekend Outfits",
      bullets: [
        "Soft, easy-to-style look designed for everyday wear and travel packing.",
        "Clean fit pairs well with jeans, skirts, trousers, and layered outfits.",
        "Print direction adds visual interest without feeling too loud for daily use.",
        "Great for casual office days, weekend plans, vacation styling, and gifting.",
        "Check the size chart before ordering for the best fit."
      ],
      keywords: [
        "women printed top",
        "casual blouse",
        "everyday shirt",
        "soft blouse",
        "travel outfit",
        "work blouse",
        "weekend top",
        "botanical print",
        "summer blouse",
        "lightweight top",
        "women fashion",
        "resort wear",
        "vacation top",
        "office casual",
        "comfortable shirt",
        "loose fit top",
        "gift for women",
        "stylish blouse",
        "day to night outfit",
        "layering top",
        "printed blouse",
        "spring outfit",
        "fall outfit",
        "basic fashion top",
        "boutique style",
        "ecommerce fashion",
        "model photo prompt",
        "textile print",
        "vector pattern",
        "product image"
      ]
    },
    nextInputsNeeded: ["样衣正反面照片", "面料成分和克重", "目标平台", "成本区间", "尺码表", "颜色和库存计划"]
  };
}

function list(items = []) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderResult(data) {
  latestResult = data;
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
        <h3>${escapeHtml(data.conceptName || "Concept")}</h3>
        <p>${escapeHtml(data.summary || "")}</p>
        ${list(data.positioning || [])}
      </div>

      <div class="prompt-grid">${directions}</div>

      <div class="result-block">
        <h3>产品图提示词</h3>
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
        <h3>关键词</h3>
        <div class="tag-cloud">
          ${(data.listingCopy?.keywords || []).map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}
        </div>
      </div>

      <div class="result-block">
        <h3>还需要补充</h3>
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
  } catch {
    return mockDesign(payload);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector(".primary-action");
  submit.disabled = true;
  submit.querySelector("span").textContent = "生成中";

  try {
    const data = await requestDesign(formPayload());
    renderResult(data);
    document.querySelector("#apiStatus").textContent = data.mode === "demo" ? "演示输出" : "已连接模型";
    showToast("方案已生成");
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = "生成设计方案";
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
    showToast("请先生成方案");
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

  showToast("正在生成产品图");
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
