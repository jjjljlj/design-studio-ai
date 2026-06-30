const projectContent = document.querySelector("#projectContent");
const confirmTitle = document.querySelector("#confirmTitle");
const confirmSummary = document.querySelector("#confirmSummary");
const confirmStatus = document.querySelector("#confirmStatus");
const confirmUpdated = document.querySelector("#confirmUpdated");
const confirmForm = document.querySelector("#confirmForm");
const directionChoices = document.querySelector("#directionChoices");
const confirmMessage = document.querySelector("#confirmMessage");

const projectId = new URLSearchParams(location.search).get("id");
let currentProject = null;

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

function statusText(status) {
  return {
    waiting_confirmation: "等待客户确认",
    feedback_received: "已收到修改意见",
    approved: "客户已通过"
  }[status] || "进行中";
}

function setMessage(message, isError = false) {
  confirmMessage.textContent = message;
  confirmMessage.dataset.error = isError ? "true" : "false";
}

function renderDirectionChoices(directions = []) {
  const choices = directions.length ? directions : [{ name: "整体方案", details: "确认当前方案方向" }];
  directionChoices.innerHTML = choices
    .map(
      (direction, index) => `
        <label class="choice-card">
          <input type="radio" name="selectedDirection" value="${escapeHtml(direction.name || `Direction ${index + 1}`)}" ${index === 0 ? "checked" : ""} />
          <span>
            <strong>${escapeHtml(direction.name || `Direction ${index + 1}`)}</strong>
            <small>${escapeHtml(direction.details || "")}</small>
          </span>
        </label>`
    )
    .join("");
}

function renderProject(project) {
  currentProject = project;
  const brief = project.brief || {};
  const result = project.result || {};
  const directions = result.designDirections || [];
  const prompts = result.imagePrompts || [];
  const listing = result.listingCopy || {};
  const scripts = result.tiktokScripts || [];
  const latestConfirmation = (project.confirmations || []).at(-1);

  confirmTitle.textContent = result.conceptName || brief.category || "客户方案确认";
  confirmSummary.textContent = result.summary || "请查看以下方案，并选择你希望继续推进的方向。";
  confirmStatus.textContent = statusText(project.status);
  confirmUpdated.textContent = `更新时间：${project.updatedAt || project.createdAt || "-"}`;

  renderDirectionChoices(directions);

  projectContent.innerHTML = `
    <div class="confirm-meta-grid">
      <div><span>客户/品牌</span><strong>${escapeHtml(brief.customer || "未填写")}</strong></div>
      <div><span>品类</span><strong>${escapeHtml(brief.category || "未填写")}</strong></div>
      <div><span>市场</span><strong>${escapeHtml(brief.market || "未填写")}</strong></div>
      <div><span>平台</span><strong>${escapeHtml(brief.platform || "未填写")}</strong></div>
    </div>

    <div class="confirm-section">
      <h2>方案定位</h2>
      ${list(result.positioning || [])}
    </div>

    <div class="confirm-section">
      <h2>推荐方向</h2>
      <div class="prompt-grid">
        ${directions
          .map(
            (item, index) => `
              <article class="prompt-box">
                <p><strong>Direction ${index + 1}: ${escapeHtml(item.name)}</strong></p>
                <p>${escapeHtml(item.details)}</p>
                <p><strong>风险提醒：</strong>${escapeHtml(item.risk)}</p>
              </article>`
          )
          .join("")}
      </div>
    </div>

    <div class="confirm-section">
      <h2>产品图生成规划</h2>
      <div class="prompt-grid">
        ${prompts
          .map(
            (item) => `
              <article class="prompt-box">
                <p><strong>${escapeHtml(item.usage)}</strong> · ${escapeHtml(item.ratio)}</p>
                <p>${escapeHtml(item.prompt)}</p>
                <p><strong>Negative:</strong> ${escapeHtml(item.negative)}</p>
              </article>`
          )
          .join("")}
      </div>
    </div>

    <div class="confirm-section">
      <h2>英文上架文案</h2>
      <p><strong>Title:</strong> ${escapeHtml(listing.title || "")}</p>
      ${list(listing.bullets || [])}
      <div class="tag-cloud">${(listing.keywords || []).map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}</div>
    </div>

    <div class="confirm-section">
      <h2>TK 短视频脚本</h2>
      <div class="prompt-grid">
        ${scripts
          .map(
            (script, index) => `
              <article class="prompt-box">
                <p><strong>Script ${index + 1}</strong></p>
                <p><strong>Hook:</strong> ${escapeHtml(script.hook)}</p>
                ${list(script.shots || [])}
                <p><strong>Voiceover:</strong> ${escapeHtml(script.voiceover)}</p>
                <p><strong>Caption:</strong> ${escapeHtml(script.caption)}</p>
              </article>`
          )
          .join("")}
      </div>
    </div>

    <div class="confirm-section">
      <h2>还需要补充</h2>
      ${list(result.nextInputsNeeded || [])}
    </div>

    ${
      latestConfirmation
        ? `<div class="confirm-section confirmation-record">
            <h2>最近一次客户意见</h2>
            <p><strong>${escapeHtml(latestConfirmation.decision)}</strong> · ${escapeHtml(latestConfirmation.selectedDirection)}</p>
            <p>${escapeHtml(latestConfirmation.notes)}</p>
          </div>`
        : ""
    }
  `;
}

async function loadProject() {
  if (!projectId) {
    confirmTitle.textContent = "链接不完整";
    confirmSummary.textContent = "缺少项目 ID，请检查确认链接。";
    return;
  }

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
    const project = await response.json();
    if (!response.ok) throw new Error(project.error || "项目读取失败");
    renderProject(project);
  } catch (error) {
    confirmTitle.textContent = "项目读取失败";
    confirmSummary.textContent = error.message;
    projectContent.innerHTML = `
      <div class="empty-state">
        <h3>没有找到这个项目</h3>
        <p>可能是链接不完整，或当前演示版服务重新部署后临时项目记录已清空。</p>
      </div>
    `;
  }
}

confirmForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!projectId || !currentProject) {
    setMessage("项目还没有加载完成。", true);
    return;
  }

  const submit = confirmForm.querySelector("button[type='submit']");
  submit.disabled = true;
  submit.textContent = "提交中...";

  try {
    const payload = Object.fromEntries(new FormData(confirmForm).entries());
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "提交失败");
    setMessage("确认意见已提交，我们会根据你的反馈继续整理。");
    await loadProject();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    submit.disabled = false;
    submit.textContent = "提交确认意见";
  }
});

loadProject();
