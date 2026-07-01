const adminPinInput = document.querySelector("#adminPin");
const loadAdminButton = document.querySelector("#loadAdmin");
const refreshAdminButton = document.querySelector("#refreshAdmin");
const exportFeedbackButton = document.querySelector("#exportFeedback");
const adminMessage = document.querySelector("#adminMessage");
const adminDashboard = document.querySelector("#adminDashboard");
const adminStats = document.querySelector("#adminStats");
const projectList = document.querySelector("#projectList");
const feedbackList = document.querySelector("#feedbackList");
const projectCount = document.querySelector("#projectCount");
const feedbackCount = document.querySelector("#feedbackCount");
const toast = document.querySelector("#toast");
const storageKey = "design-studio-admin-pin";

const statusLabels = {
  waiting_confirmation: "等待客户确认",
  feedback_received: "已收到修改意见",
  approved: "客户已通过"
};

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

function setAdminMessage(message, isError = false) {
  adminMessage.textContent = message;
  adminMessage.dataset.error = isError ? "true" : "false";
}

function adminPin() {
  return adminPinInput.value.trim();
}

function dateText(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return value;
  }
}

function statusText(status) {
  return statusLabels[status] || "进行中";
}

function absoluteUrl(path) {
  return new URL(path, location.origin).toString();
}

function renderStats(summary) {
  const totals = summary.totals || {};
  const status = summary.status || {};
  const storage = status.storage || {};
  adminStats.innerHTML = [
    ["项目总数", totals.projects || 0],
    ["待确认", totals.waiting || 0],
    ["已反馈", totals.feedbackReceived || 0],
    ["已通过", totals.approved || 0],
    ["试用线索", totals.leads || 0],
    ["素材库", totals.libraryConcepts || 0],
    ["当前模型", `${status.textProvider || "-"} / ${status.imageProvider || "-"}`],
    ["数据保存", storage.persistent ? "云数据库" : "临时文件"]
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>`
    )
    .join("");
}

function renderProjects(projects = []) {
  projectCount.textContent = projects.length;
  if (!projects.length) {
    projectList.innerHTML = `<div class="empty-record">还没有项目记录。先在工作台生成方案并保存确认链接。</div>`;
    return;
  }

  projectList.innerHTML = projects
    .map((project) => {
      const brief = project.brief || {};
      const result = project.result || {};
      const latest = project.latestConfirmation;
      const link = absoluteUrl(project.confirmationUrl || `/confirm.html?id=${project.id}`);
      return `
        <article class="record-card">
          <div class="record-title">
            <div>
              <strong>${escapeHtml(result.conceptName || brief.category || "未命名项目")}</strong>
              <span>${escapeHtml(statusText(project.status))} · ${escapeHtml(dateText(project.updatedAt || project.createdAt))}</span>
            </div>
            <a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">确认页</a>
          </div>
          <div class="record-meta">
            <span>客户：${escapeHtml(brief.customer || "未填写")}</span>
            <span>品类：${escapeHtml(brief.category || "未填写")}</span>
            <span>市场：${escapeHtml(brief.market || "未填写")}</span>
            <span>平台：${escapeHtml(brief.platform || "未填写")}</span>
          </div>
          ${
            latest
              ? `<div class="record-note">
                  <strong>${escapeHtml(latest.decision)} · ${escapeHtml(latest.selectedDirection)}</strong>
                  <p>${escapeHtml(latest.notes || "客户未填写详细意见")}</p>
                  <small>${escapeHtml(latest.customerName || "")} ${escapeHtml(latest.company || "")} ${escapeHtml(latest.contact || "")}</small>
                </div>`
              : `<div class="record-note muted-note">客户还没有提交确认意见。</div>`
          }
          <button type="button" class="copy-link" data-link="${escapeHtml(link)}">复制确认链接</button>
        </article>
      `;
    })
    .join("");
}

function renderFeedback(feedback = []) {
  feedbackCount.textContent = feedback.length;
  if (!feedback.length) {
    feedbackList.innerHTML = `<div class="empty-record">还没有首页试用申请。</div>`;
    return;
  }

  feedbackList.innerHTML = feedback
    .map(
      (item) => `
        <article class="record-card">
          <div class="record-title">
            <div>
              <strong>${escapeHtml(item.name || "未填写姓名")}</strong>
              <span>${escapeHtml(item.company || "未填写公司")} · ${escapeHtml(dateText(item.createdAt))}</span>
            </div>
          </div>
          <div class="record-meta">
            <span>邮箱：${escapeHtml(item.contact?.email || "未填写")}</span>
            <span>手机：${escapeHtml(item.contact?.phone || "未填写")}</span>
            <span>阶段：${escapeHtml(item.businessStage || "未填写")}</span>
            <span>来源：${escapeHtml(item.sourceChannel || item.source || "未填写")}</span>
          </div>
          <div class="record-note">
            <strong>核心问题</strong>
            <p>${escapeHtml(item.useCase || "未填写")}</p>
            <strong>目标市场/人群</strong>
            <p>${escapeHtml(item.expectedResult || "未填写")}</p>
            <small>${escapeHtml(item.budget || "")} ${escapeHtml(item.notes || "")}</small>
          </div>
        </article>`
    )
    .join("");
}

async function loadAdminSummary() {
  const pin = adminPin();
  if (!pin) {
    setAdminMessage("请输入管理密码。", true);
    return;
  }

  setAdminMessage("正在读取项目记录...");
  loadAdminButton.disabled = true;
  refreshAdminButton.disabled = true;

  try {
    const response = await fetch("/api/admin/summary", {
      headers: { "X-Admin-Pin": pin }
    });
    const summary = await response.json();
    if (!response.ok) throw new Error(summary.error || "读取失败");
    sessionStorage.setItem(storageKey, pin);
    adminDashboard.hidden = false;
    setAdminMessage(`已更新：${dateText(summary.generatedAt)}`);
    renderStats(summary);
    renderProjects(summary.projects || []);
    renderFeedback(summary.feedback || []);
  } catch (error) {
    const setupTip = error.message.includes("ADMIN_PIN")
      ? "请先在 Render 环境变量里添加 ADMIN_PIN。"
      : error.message;
    setAdminMessage(setupTip, true);
  } finally {
    loadAdminButton.disabled = false;
    refreshAdminButton.disabled = false;
  }
}

async function exportFeedbackCsv() {
  const pin = adminPin();
  if (!pin) {
    setAdminMessage("请先输入管理密码。", true);
    return;
  }
  try {
    const response = await fetch("/api/admin/feedback.csv", {
      headers: { "X-Admin-Pin": pin }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `design-studio-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("试用线索 CSV 已开始下载");
  } catch (error) {
    setAdminMessage(`导出失败：${error?.message || "请稍后重试"}`, true);
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest(".copy-link");
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.link);
    showToast("确认链接已复制");
  } catch {
    showToast("复制失败，请手动打开确认页");
  }
});

loadAdminButton.addEventListener("click", loadAdminSummary);
refreshAdminButton.addEventListener("click", loadAdminSummary);
exportFeedbackButton?.addEventListener("click", exportFeedbackCsv);
adminPinInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadAdminSummary();
});

const savedPin = sessionStorage.getItem(storageKey);
if (savedPin) {
  adminPinInput.value = savedPin;
  loadAdminSummary();
}
