const PRONOTE_URL = "https://3500010j.index-education.net/pronote/professeur.html";
const MAX_TRANSFER_AGE_MS = 60 * 60 * 1000;

function validScreen(raw) {
  const width = Math.max(800, Math.round(Number(raw?.availWidth) || 1600));
  const height = Math.max(600, Math.round(Number(raw?.availHeight) || 900));
  return {
    left: Math.round(Number(raw?.availLeft) || 0),
    top: Math.round(Number(raw?.availTop) || 0),
    width,
    height
  };
}

async function splitWithPronote(sender, payload, rawScreen) {
  if (!sender.tab?.windowId) throw Error("Fenêtre EPS introuvable.");
  if (payload?.format !== "eps-pronote-v1" || !Array.isArray(payload.rows) || !payload.rows.length) {
    throw Error("Transfert EPS invalide ou vide.");
  }
  await chrome.storage.session.set({ epsPronotePending: { payload, createdAt: Date.now() } });
  const screen = validScreen(rawScreen);
  const gap = 8;
  const leftWidth = Math.floor((screen.width - gap) / 2);
  const rightWidth = screen.width - gap - leftWidth;

  await chrome.windows.update(sender.tab.windowId, { state: "normal" });
  await chrome.windows.update(sender.tab.windowId, {
    left: screen.left,
    top: screen.top,
    width: leftWidth,
    height: screen.height
  });
  await chrome.windows.create({
    url: PRONOTE_URL,
    type: "normal",
    focused: true,
    left: screen.left + leftWidth + gap,
    top: screen.top,
    width: rightWidth,
    height: screen.height
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "EPS_PRONOTE_SPLIT") {
      await splitWithPronote(sender, message.payload, message.screen);
      return { ok: true };
    }
    if (message?.type === "EPS_PRONOTE_GET_PENDING") {
      const { epsPronotePending } = await chrome.storage.session.get("epsPronotePending");
      if (!epsPronotePending || Date.now() - epsPronotePending.createdAt > MAX_TRANSFER_AGE_MS) {
        await chrome.storage.session.remove("epsPronotePending");
        return { ok: false };
      }
      return { ok: true, payload: epsPronotePending.payload };
    }
    if (message?.type === "EPS_PRONOTE_CLEAR_PENDING") {
      await chrome.storage.session.remove("epsPronotePending");
      return { ok: true };
    }
    return { ok: false };
  })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
