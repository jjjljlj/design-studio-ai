const feedbackForm = document.querySelector("#feedbackForm");
const feedbackStatus = document.querySelector("#feedbackStatus");
const localStorageKey = "design-studio-feedback-local";

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
