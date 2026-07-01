const employeeForm = document.querySelector("#employeeForm");
const fillEmployeeDemo = document.querySelector("#fillEmployeeDemo");
const refreshLibrary = document.querySelector("#refreshLibrary");
const libraryList = document.querySelector("#libraryList");
const employeeStatus = document.querySelector("#employeeStatus");
const toast = document.querySelector("#toast");
const employeePinKey = "design-studio-employee-pin";
const imageCooldownKey = "design-studio-employee-image-cooldown";
const imageCooldownSeconds = 45;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function setStatus(message, isError = false) {
  employeeStatus.textContent = message;
  employeeStatus.dataset.error = isError ? "true" : "false";
}

function adminPin() {
  return employeeForm.adminPin.value.trim();
}

function imageCooldownRemaining() {
  const lastUsedAt = Number(sessionStorage.getItem(imageCooldownKey) || 0);
  return Math.max(0, imageCooldownSeconds - Math.floor((Date.now() - lastUsedAt) / 1000));
}

function markImageCooldown() {
  sessionStorage.setItem(imageCooldownKey, String(Date.now()));
}

function dateText(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return value;
  }
}

function palette(colors = []) {
  return `
    <div class="library-palette">
      ${colors
        .map(
          (color) => `
            <span title="${escapeHtml(color.name || "")}" style="--swatch:${escapeHtml(color.hex || "#d9e1e1")}"></span>`
        )
        .join("")}
    </div>
  `;
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function listMarkup(items = []) {
  const values = normalizeList(items);
  if (!values.length) return "";
  return `
    <ul>
      ${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>`;
}

function uniqueValues(values = []) {
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function listingKeywords(concept) {
  return uniqueValues([
    concept.category,
    concept.patternName,
    "satin sleepwear",
    "silky pajama set",
    "women's loungewear",
    "bridal sleepwear",
    "bridesmaid gift",
    "vacation resort wear",
    "lace trim pajamas",
    "contrast piping pajamas",
    "gift for her",
    ...(concept.titleDirection || "").split(/[\s,/|-]+/).filter((word) => word.length > 3)
  ]).slice(0, 30);
}

function listingPackage(concept) {
  const title = concept.titleDirection || `${concept.name || "Women's Satin Sleepwear"} for Women`;
  const bullets = uniqueValues([
    ...normalizeList(concept.coreSellingPoints),
    concept.fabricAndCraft ? `Soft fabric direction: ${concept.fabricAndCraft}` : "",
    concept.patternDescription ? `Print/detail direction: ${concept.patternDescription}` : "",
    concept.listingAngle || ""
  ]).slice(0, 5);
  const filledBullets = [
    ...bullets,
    "Designed for lounge, sleep, gifting, and vacation styling.",
    "Easy to style for ecommerce main images, detail pages, and TikTok short videos."
  ].slice(0, 5);
  return {
    title,
    bullets: filledBullets,
    keywords: listingKeywords(concept),
    imageList: [
      "Main image: full outfit on model, clean vertical ecommerce crop.",
      "Lifestyle image: warm bedroom, French apartment, bridal morning, or resort scene.",
      "Detail image: satin sheen, lace trim, piping, bow, print, hem, and strap details.",
      "Flat lay image: complete set pieces with color/print clearly visible.",
      "Size/care image: size chart, fabric composition, wash care, and fit notes."
    ],
    skuFields: [
      "Style name / style code",
      "Color or print name",
      "Size range",
      "Fabric composition",
      "Set pieces included",
      "Package weight and dimensions",
      "Care instructions",
      "Image rights status"
    ],
    missing: [
      "Exact fabric composition and gram weight",
      "Confirmed size chart and fit model measurements",
      "Real sample photos or approved AI image rights",
      "Cost, target price, shipping weight, and packaging details",
      "Platform compliance review before publishing"
    ]
  };
}

function listingText(concept) {
  const pack = listingPackage(concept);
  return [
    `Title: ${pack.title}`,
    "",
    "Five Bullet Points:",
    ...pack.bullets.map((item, index) => `${index + 1}. ${item}`),
    "",
    `Keywords: ${pack.keywords.join(", ")}`,
    "",
    "Image List:",
    ...pack.imageList.map((item, index) => `${index + 1}. ${item}`),
    "",
    "SKU Fields:",
    ...pack.skuFields.map((item) => `- ${item}`),
    "",
    "Missing Info Before Listing:",
    ...pack.missing.map((item) => `- ${item}`)
  ].join("\n");
}

function listingMarkup(concept) {
  const pack = listingPackage(concept);
  const text = listingText(concept);
  return `
    <div class="library-listing-package" data-listing-package hidden>
      <div class="listing-package-head">
        <strong>上架前审核资料包</strong>
        <button type="button" class="copy-listing-package" data-package="${escapeHtml(text)}">复制资料包</button>
      </div>
      <div class="listing-section">
        <span>English Title</span>
        <p>${escapeHtml(pack.title)}</p>
      </div>
      <div class="listing-section">
        <span>Five Bullet Points</span>
        ${listMarkup(pack.bullets)}
      </div>
      <div class="listing-section">
        <span>Search Keywords</span>
        <p>${escapeHtml(pack.keywords.join(", "))}</p>
      </div>
      <div class="listing-section">
        <span>Image Checklist</span>
        ${listMarkup(pack.imageList)}
      </div>
      <div class="listing-section">
        <span>SKU Fields</span>
        ${listMarkup(pack.skuFields)}
      </div>
      <div class="listing-section missing">
        <span>Missing Info</span>
        ${listMarkup(pack.missing)}
      </div>
    </div>`;
}

function conceptCard(record) {
  const concept = record.concept || record;
  const cardId = escapeHtml(record.id || `${concept.name || "concept"}-${record.createdAt || Date.now()}`);
  const prompts = [
    ["产品图", concept.imagePrompt],
    ["矢量图", concept.vectorPrompt],
    ["TK钩子", concept.tiktokHook]
  ].filter(([, value]) => value);
  const imageActions = [
    ["product", "生成服装模特照预览", "1024x1536", concept.imagePrompt],
    ["pattern", "生成花型概念图", "1024x1024", concept.vectorPrompt]
  ].filter(([, , , value]) => value);

  return `
    <article class="library-card" data-concept-card="${cardId}">
      <div class="library-card-head">
        <div>
          <span>${escapeHtml(record.employee?.name || "Lina")} · ${escapeHtml(dateText(record.createdAt))}</span>
          <h3>${escapeHtml(concept.name || "未命名方向")}</h3>
        </div>
        ${palette(concept.colorPalette || [])}
      </div>
      <p class="library-line">${escapeHtml(concept.styleDirection || "")}</p>
      <div class="library-meta">
        <span>${escapeHtml(concept.category || "品类待定")}</span>
        <span>${escapeHtml(concept.patternName || "花型待定")}</span>
        <span>${escapeHtml(concept.targetCustomer || "人群待定")}</span>
      </div>
      <div class="library-detail">
        <strong>款式</strong>
        <p>${escapeHtml(concept.silhouette || "")}</p>
        <strong>花型</strong>
        <p>${escapeHtml(concept.patternDescription || "")}</p>
        <strong>面料/工艺</strong>
        <p>${escapeHtml(concept.fabricAndCraft || "")}</p>
      </div>
      <div class="library-commercial">
        ${normalizeList(concept.platformUsage).length
          ? `<strong>适合平台/用途</strong>${listMarkup(concept.platformUsage)}`
          : ""}
        ${concept.titleDirection
          ? `<strong>英文标题方向</strong><p>${escapeHtml(concept.titleDirection)}</p>`
          : ""}
        ${normalizeList(concept.coreSellingPoints).length
          ? `<strong>核心卖点</strong>${listMarkup(concept.coreSellingPoints)}`
          : ""}
        ${concept.tiktokHook
          ? `<strong>TK 3秒钩子</strong><p>${escapeHtml(concept.tiktokHook)}</p>`
          : ""}
      </div>
      <div class="library-prompts">
        ${prompts
          .map(
            ([label, value]) => `
              <button type="button" class="copy-prompt" data-prompt="${escapeHtml(value)}">${escapeHtml(label)}</button>`
          )
          .join("")}
      </div>
      <div class="library-image-actions">
        ${imageActions
          .map(
            ([kind, label, size, value]) => `
              <button type="button" class="generate-concept-image" data-kind="${kind}" data-size="${size}" data-prompt="${escapeHtml(value)}">${label}</button>`
          )
          .join("")}
        <button type="button" class="build-listing-package">生成上架资料包</button>
      </div>
      ${listingMarkup(concept)}
      <div class="library-image-preview" data-image-output>
        <div>当前为款式/花型数据库记录。先确认款式方向，再少量生成模特照或花型概念图。当前文生图不是精确样衣试穿，商用前必须人工质检。</div>
      </div>
      <div class="library-next">
        <strong>下一步</strong>
        <p>${escapeHtml(concept.nextAction || "")}</p>
      </div>
    </article>
  `;
}

function renderLibrary(records = []) {
  if (!records.length) {
    libraryList.innerHTML = `<div class="empty-record">素材库还没有记录。先给AI员工派一个任务。</div>`;
    return;
  }
  libraryList.innerHTML = records.map(conceptCard).join("");
}

async function loadLibrary() {
  const pin = adminPin();
  if (!pin) {
    setStatus("请输入管理密码。", true);
    return;
  }

  try {
    const response = await fetch("/api/library/concepts", {
      headers: { "X-Admin-Pin": pin }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "读取失败");
    sessionStorage.setItem(employeePinKey, pin);
    setStatus(`素材库已读取，共 ${data.concepts.length} 条记录。`);
    renderLibrary(data.concepts);
  } catch (error) {
    setStatus(error.message, true);
  }
}

fillEmployeeDemo.addEventListener("click", () => {
  employeeForm.category.value = "women's summer dress";
  employeeForm.market.value = "US";
  employeeForm.platform.value = "TikTok Shop / Shopify";
  employeeForm.season.value = "Spring / Summer";
  employeeForm.theme.value = "美区夏季碎花连衣裙素材库";
  employeeForm.styleKeywords.value = "轻度假、显瘦、低饱和花型、适合主图和9:16短视频";
  employeeForm.fabric.value = "轻薄梭织、人棉感、数码印花";
  employeeForm.pricePosition.value = "mid-market";
  employeeForm.count.value = "6";
  showToast("AI员工任务示例已填入");
});

employeeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const pin = adminPin();
  if (!pin) {
    setStatus("请输入管理密码。", true);
    return;
  }

  const submit = employeeForm.querySelector("button[type='submit']");
  submit.disabled = true;
  submit.querySelector("span").textContent = "Lina 设计中...";
  setStatus("AI员工正在生成款式与花型方向，会自动保存进素材库。");

  try {
    const payload = Object.fromEntries(new FormData(employeeForm).entries());
    delete payload.adminPin;
    const response = await fetch("/api/employee/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Pin": pin
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "生成失败");
    sessionStorage.setItem(employeePinKey, pin);
    setStatus(`已生成并入库 ${result.savedCount || 0} 个方向：${result.batchTitle || "AI素材批次"}`);
    await loadLibrary();
    showToast("AI员工已完成本轮设计");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = "让AI员工生成并入库";
  }
});

refreshLibrary.addEventListener("click", loadLibrary);

document.addEventListener("click", async (event) => {
  const copyButton = event.target.closest(".copy-prompt");
  if (copyButton) {
    try {
      await navigator.clipboard.writeText(copyButton.dataset.prompt);
      showToast("提示词已复制");
    } catch {
      showToast("复制失败，请手动选择文字");
    }
    return;
  }

  const packageCopyButton = event.target.closest(".copy-listing-package");
  if (packageCopyButton) {
    try {
      await navigator.clipboard.writeText(packageCopyButton.dataset.package || "");
      showToast("上架资料包已复制");
    } catch {
      showToast("复制失败，请手动选择文字");
    }
    return;
  }

  const listingButton = event.target.closest(".build-listing-package");
  if (listingButton) {
    const card = listingButton.closest(".library-card");
    const packagePanel = card?.querySelector("[data-listing-package]");
    if (!packagePanel) return;
    packagePanel.hidden = !packagePanel.hidden;
    listingButton.textContent = packagePanel.hidden ? "生成上架资料包" : "收起资料包";
    return;
  }

  const imageButton = event.target.closest(".generate-concept-image");
  if (!imageButton) return;

  const pin = adminPin();
  if (!pin) {
    setStatus("请输入管理密码后再生成图片。", true);
    return;
  }

  const card = imageButton.closest(".library-card");
  const preview = card?.querySelector("[data-image-output]");
  const prompt = imageButton.dataset.prompt;
  if (!preview || !prompt) return;

  const waitSeconds = imageCooldownRemaining();
  if (waitSeconds > 0) {
    setStatus(`图片生成冷却中，请等待 ${waitSeconds} 秒后再试，避免连续消耗额度。`, true);
    return;
  }

  const originalText = imageButton.textContent;
  imageButton.disabled = true;
  imageButton.textContent = "生成中...";
  markImageCooldown();
  preview.innerHTML = `
    <div class="library-image-loading">
      AI图片生成中，通常需要几十秒。生成结果仅供内部预览，未授权不要转发或商用。
    </div>`;
  setStatus("正在生成图片预览，会消耗少量图片模型额度。");

  try {
    const response = await fetch("/api/generate/image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Pin": pin
      },
      body: JSON.stringify({
        prompt,
        kind: imageButton.dataset.kind || "product",
        size: imageButton.dataset.size || "1024x1024",
        quality: "medium"
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "图片生成失败");

    const imageHtml = data.image
      ? `<img src="${escapeHtml(data.image)}" alt="AI生成素材预览" loading="lazy" />`
      : `<div class="image-placeholder">当前图片模型未返回图片，可复制提示词稍后重试。</div>`;

    preview.innerHTML = `
      <div class="rights-note">内部演示 / 需确认商用授权 / 建议加水印后再给客户下载。</div>
      ${imageHtml}
      ${Array.isArray(data.qualityChecklist) && data.qualityChecklist.length
        ? `<div class="image-qa"><strong>出图后人工质检</strong>${listMarkup(data.qualityChecklist)}</div>`
        : ""}
      <details>
        <summary>查看使用的提示词</summary>
        <p>${escapeHtml(data.prompt || prompt)}</p>
      </details>
      ${data.note ? `<p class="library-image-note">${escapeHtml(data.note)}</p>` : ""}`;
    setStatus("图片预览已生成。");
    showToast("图片预览已生成");
  } catch (error) {
    preview.innerHTML = `<div class="library-image-error">${escapeHtml(error.message)}</div>`;
    setStatus(error.message, true);
  } finally {
    imageButton.disabled = false;
    imageButton.textContent = originalText;
  }
});

const savedPin = sessionStorage.getItem(employeePinKey);
if (savedPin) {
  employeeForm.adminPin.value = savedPin;
  loadLibrary();
}
