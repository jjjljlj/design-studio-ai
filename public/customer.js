const feedbackForm = document.querySelector("#feedbackForm");
const feedbackStatus = document.querySelector("#feedbackStatus");
const customerRuntimeStatus = document.querySelector("#customerRuntimeStatus");
const customerRuntimeNote = document.querySelector("#customerRuntimeNote");
const localStorageKey = "design-studio-feedback-local";

const providerNames = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  qwen: "千问/通义",
  demo: "演示模式"
};

function providerName(provider) {
  return providerNames[String(provider || "").toLowerCase()] || provider || "未配置";
}

async function loadCustomerRuntimeStatus() {
  if (!customerRuntimeStatus || !customerRuntimeNote) return;

  if (location.protocol === "file:") {
    customerRuntimeStatus.textContent = "本地预览模式";
    customerRuntimeNote.textContent = "部署到线上后会自动显示正式模型状态。";
    return;
  }

  try {
    const response = await fetch("/api/status");
    if (!response.ok) throw new Error("status request failed");
    const status = await response.json();
    customerRuntimeStatus.textContent = `已上线：文本 ${providerName(status.textProvider)} / 图片 ${providerName(status.imageProvider)}`;
    const configured = status.configured || {};
    customerRuntimeNote.textContent = [
      configured.deepseek ? "DeepSeek 文案生成已接入" : "DeepSeek 待接入",
      configured.openai ? "OpenAI 图片生成已接入" : "OpenAI 待接入",
      configured.qwen ? "千问已接入" : "千问可作为下一步成本测试"
    ].join(" · ");
  } catch {
    customerRuntimeStatus.textContent = "状态检测中";
    customerRuntimeNote.textContent = "如果页面能正常生成内容，说明线上服务正在运行。";
  }
}

function setFeedbackStatus(message, isError = false) {
  if (!feedbackStatus) return;
  feedbackStatus.textContent = message;
  feedbackStatus.dataset.error = isError ? "true" : "false";
}

function saveFeedbackLocal(payload) {
  try {
    const keyData = JSON.parse(localStorage.getItem(localStorageKey) || "[]");
    keyData.unshift({
      ...payload,
      id: payload.id || `local-${Date.now()}`,
      createdAt: new Date().toISOString(),
      source: "customer-page",
      sourceMode: location.protocol === "file:" ? "file-mode" : "browser-mode"
    });
    localStorage.setItem(localStorageKey, JSON.stringify(keyData.slice(0, 20)));
  } catch {}
}

async function submitFeedback(payload) {
  if (location.protocol === "file:") {
    saveFeedbackLocal(payload);
    return { ok: true, message: "已保存到本地记录（文件模式）", id: payload.id || `local-${Date.now()}` };
  }

  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    saveFeedbackLocal(payload);
    return {
      ok: false,
      fallback: true,
      message: `提交失败，已临时保存本地。${error?.message || ""}`
    };
  }
}

loadCustomerRuntimeStatus();

feedbackForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(feedbackForm).entries());
  data.agreeData = data.agreeData ? "true" : "false";
  if (data.agreeData !== "true") {
    setFeedbackStatus("请先勾选数据用途同意项。", true);
    return;
  }

  const submitBtn = feedbackForm.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "提交中...";
  }

  const result = await submitFeedback(data);
  if (result?.ok === true || result?.fallback === true) {
    setFeedbackStatus(result.message || "已提交，请保持电话畅通，我们会尽快联系你。");
    feedbackForm.reset();
  } else {
    setFeedbackStatus(`提交失败：${result?.error || "请稍后重试"}`, true);
  }

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = "提交试用申请";
  }
});

window.designStudioFeedback = window.designStudioFeedback || {};
window.designStudioFeedback.getLocalFeedback = () => {
  try {
    return JSON.parse(localStorage.getItem(localStorageKey) || "[]");
  } catch {
    return [];
  }
};
