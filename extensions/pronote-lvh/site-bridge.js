(() => {
  const allowedOrigin = "https://luidgi8al-del.github.io";
  if (location.origin !== allowedOrigin || !location.pathname.startsWith("/alex-eps-import/")) return;

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type !== 'EPS_PRONOTE_RETURN_NOTICE' || typeof message.message !== 'string') return;
    document.getElementById('eps-pronote-return-notice')?.remove();
    const notice = document.createElement('div'); notice.id = 'eps-pronote-return-notice'; notice.setAttribute('role', 'alert');
    notice.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;max-width:min(480px,90vw);padding:16px;border:1px solid #d89719;border-radius:12px;background:#fff8e7;color:#183e55;box-shadow:0 4px 24px #0003';
    const text = document.createElement('p'); text.textContent = message.message;
    const dismiss = document.createElement('button'); dismiss.textContent = 'Compris'; dismiss.onclick = () => notice.remove();
    notice.append(text, dismiss); document.body.append(notice);
  });

  window.addEventListener("message", async event => {
    if (event.source !== window || event.origin !== allowedOrigin || !["EPS_PRONOTE_SPLIT_REQUEST", "EPS_PRONOTE_RETURN_REQUEST"].includes(event.data?.type)) return;
    const { requestId, payload, screen } = event.data;
    const returning = event.data.type === "EPS_PRONOTE_RETURN_REQUEST";
    const resultType = returning ? "EPS_PRONOTE_RETURN_RESULT" : "EPS_PRONOTE_SPLIT_RESULT";
    try {
      const response = await chrome.runtime.sendMessage(returning ? {type: "EPS_PRONOTE_RETURN"} : { type: "EPS_PRONOTE_SPLIT", payload, screen });
      window.postMessage({
        type: resultType,
        requestId,
        ok: Boolean(response?.ok),
        protocol: response?.protocol,
        canReturnToEps: response?.canReturnToEps,
        warning: response?.warning || "",
        fullWidth: response?.fullWidth,
        error: response?.error || ""
      }, allowedOrigin);
    } catch (error) {
      window.postMessage({ type: resultType, requestId, ok: false, error: error.message }, allowedOrigin);
    }
  });
})();
