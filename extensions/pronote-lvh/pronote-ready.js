(() => {
  if (location.origin !== "https://3500010j.index-education.net" || !location.pathname.startsWith("/pronote/")) return;

  async function installReadyButton() {
    const response = await chrome.runtime.sendMessage({ type: "EPS_PRONOTE_GET_PENDING" });
    if (!response?.ok || !response.payload || document.getElementById("eps-pronote-ready")) return;

    const host = document.createElement("div");
    host.id = "eps-pronote-ready";
    host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483646";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      section{font:14px system-ui;color:#173e57;background:white;border:2px solid #087dca;border-radius:14px;padding:12px;box-shadow:0 8px 28px #0004;max-width:290px}
      b{display:block;margin-bottom:4px}p{margin:0 0 9px;color:#587186}button{border:0;border-radius:9px;padding:10px 13px;font:700 14px system-ui;cursor:pointer}
      #transfer{background:#087dca;color:white}#close{float:right;background:transparent;color:#587186;padding:2px 6px}
    </style><section><button id="close" aria-label="Masquer">×</button><b>Notes EPS prêtes</b>
      <p id="summary"></p>
      <button id="transfer">Vérifier et transférer</button></section>`;
    root.getElementById("summary").textContent = `${response.payload.className || "Classe"} · ${response.payload.title || "Évaluation"}`;
    document.body.append(host);
    root.getElementById("close").onclick = () => host.remove();
    root.getElementById("transfer").onclick = () => {
      try {
        globalThis.EpsPronoteBridge.open(response.payload);
        host.remove();
      } catch (error) {
        root.querySelector("p").textContent = error.message;
      }
    };
  }

  installReadyButton().catch(() => {});
})();
