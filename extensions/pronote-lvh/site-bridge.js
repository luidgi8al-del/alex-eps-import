(() => {
  const allowedOrigin = "https://luidgi8al-del.github.io";
  if (location.origin !== allowedOrigin || !location.pathname.startsWith("/alex-eps-import/")) return;

  window.addEventListener("message", async event => {
    if (event.source !== window || event.origin !== allowedOrigin || event.data?.type !== "EPS_PRONOTE_SPLIT_REQUEST") return;
    const { requestId, payload, screen } = event.data;
    try {
      const response = await chrome.runtime.sendMessage({ type: "EPS_PRONOTE_SPLIT", payload, screen });
      window.postMessage({
        type: "EPS_PRONOTE_SPLIT_RESULT",
        requestId,
        ok: Boolean(response?.ok),
        error: response?.error || ""
      }, allowedOrigin);
    } catch (error) {
      window.postMessage({ type: "EPS_PRONOTE_SPLIT_RESULT", requestId, ok: false, error: error.message }, allowedOrigin);
    }
  });
})();
