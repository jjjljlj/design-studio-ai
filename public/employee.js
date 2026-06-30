const employeeForm = document.querySelector("#employeeForm");
const fillEmployeeDemo = document.querySelector("#fillEmployeeDemo");
const refreshLibrary = document.querySelector("#refreshLibrary");
const libraryList = document.querySelector("#libraryList");
const employeeStatus = document.querySelector("#employeeStatus");
const toast = document.querySelector("#toast");
const employeePinKey = "design-studio-employee-pin";

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

function conceptCard(record) {
  const concept = record.concept || record;
  const prompts = [
    ["产品图", concept.imagePrompt],
    ["矢量图", concept.vectorPrompt],
    ["TK钩子", concept.tiktokHook]
  ].filter(([, value]) => value);

  return `
    <article class="library-card">
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
      <div class="library-prompts">
        ${prompts
          .map(
            ([label, value]) => `
              <button type="button" class="copy-prompt" data-prompt="${escapeHtml(value)}">${escapeHtml(label)}</button>`
          )
          .join("")}
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
  const button = event.target.closest(".copy-prompt");
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.prompt);
    showToast("提示词已复制");
  } catch {
    showToast("复制失败，请手动选择文字");
  }
});

const savedPin = sessionStorage.getItem(employeePinKey);
if (savedPin) {
  employeeForm.adminPin.value = savedPin;
  loadLibrary();
}
