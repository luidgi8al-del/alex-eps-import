/* Gmail professionnel : jeton conservé uniquement en mémoire, jamais dans le stockage local. */
(function () {
  const CLIENT_ID = "316781127256-6oih50nuhfrvfvmjqi5tqgrhm3o06qcb.apps.googleusercontent.com";
  const SCOPE = "https://www.googleapis.com/auth/gmail.compose";
  let accessToken = "", expiresAt = 0, connectedEmail = "", tokenClient = null;

  function waitForGoogleIdentity() {
    if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (globalThis.google?.accounts?.oauth2) { clearInterval(timer); resolve(); }
        else if (Date.now() - started > 12000) { clearInterval(timer); reject(Error("La connexion Google n’a pas pu être chargée. Vérifiez Internet puis réessayez.")); }
      }, 100);
    });
  }

  async function gmailProfile(token) {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      let data = {}; try { data = await response.json(); } catch {}
      throw Error(data?.error?.message || "Google refuse l’accès à cette boîte Gmail.");
    }
    return response.json();
  }

  async function connectGmailProfessional() {
    if (navigator.onLine === false) throw Error("Une connexion Internet est nécessaire pour connecter Gmail.");
    await waitForGoogleIdentity();
    return new Promise((resolve, reject) => {
      const finish = async response => {
        if (!response?.access_token) { reject(Error(response?.error_description || "Connexion Gmail annulée.")); return; }
        try {
          const profile = await gmailProfile(response.access_token);
          accessToken = response.access_token;
          expiresAt = Date.now() + Math.max(60, Number(response.expires_in || 3600) - 60) * 1000;
          connectedEmail = String(profile.emailAddress || "").toLowerCase();
          localStorage.setItem("eps_gmail_last_account", connectedEmail);
          resolve({ connected: true, email: connectedEmail, expiresAt });
        } catch (error) { reject(error); }
      };
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: finish,
        error_callback: error => reject(Error(error?.type === "popup_closed" ? "Fenêtre Google fermée avant la connexion." : "Impossible d’ouvrir la connexion Google."))
      });
      tokenClient.requestAccessToken({ prompt: "select_account" });
    });
  }

  function gmailDraftState() {
    return {
      connected: Boolean(accessToken && expiresAt > Date.now()),
      email: connectedEmail || localStorage.getItem("eps_gmail_last_account") || "",
      expiresAt
    };
  }

  function disconnectGmailProfessional() {
    if (accessToken && globalThis.google?.accounts?.oauth2) google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = ""; expiresAt = 0; connectedEmail = "";
    localStorage.removeItem("eps_gmail_last_account");
  }

  async function ensureGmailProfessional() {
    if (accessToken && expiresAt > Date.now()) return gmailDraftState();
    return connectGmailProfessional();
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  function utf8Base64(value) { return bytesToBase64(new TextEncoder().encode(String(value || ""))); }
  function wrapBase64(value) { return String(value || "").replace(/\s+/g, "").match(/.{1,76}/g)?.join("\r\n") || ""; }
  function encodedHeader(value) { return `=?UTF-8?B?${utf8Base64(value)}?=`; }
  function rawMessage(delivery) {
    const headers = [
      `To: ${delivery.to}`,
      `Subject: ${encodedHeader(delivery.subject)}`,
      "MIME-Version: 1.0"
    ];
    let mime;
    if (delivery.attachment?.content) {
      const boundary = `eps_lvh_${crypto.randomUUID().replaceAll("-", "")}`;
      const filename = encodeURIComponent(delivery.attachment.name || "document");
      mime = [
        ...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
        `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
        wrapBase64(utf8Base64(delivery.message)), "",
        `--${boundary}`, `Content-Type: ${delivery.attachment.type || "application/octet-stream"}; name*=UTF-8''${filename}`,
        `Content-Disposition: attachment; filename*=UTF-8''${filename}`, "Content-Transfer-Encoding: base64", "",
        wrapBase64(delivery.attachment.content), "", `--${boundary}--`, ""
      ].join("\r\n");
    } else {
      mime = [...headers, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrapBase64(utf8Base64(delivery.message)), ""].join("\r\n");
    }
    return bytesToBase64(new TextEncoder().encode(mime)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }

  async function createGmailDraft(delivery) {
    await ensureGmailProfessional();
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw: rawMessage(delivery) } })
    });
    if (response.status === 401) { accessToken = ""; expiresAt = 0; throw Error("La connexion Gmail a expiré. Reconnectez le compte puis reprenez au prochain élève."); }
    if (!response.ok) {
      let data = {}; try { data = await response.json(); } catch {}
      throw Error(data?.error?.message || `Gmail a refusé la création du brouillon (HTTP ${response.status}).`);
    }
    return response.json();
  }

  async function createGmailDrafts(deliveries, onProgress) {
    const created = [];
    for (let index = 0; index < deliveries.length; index++) {
      const draft = await createGmailDraft(deliveries[index]);
      created.push(draft);
      onProgress?.({ created: created.length, total: deliveries.length, delivery: deliveries[index], draft });
      if (index + 1 < deliveries.length) await new Promise(resolve => setTimeout(resolve, 250));
    }
    return created;
  }

  function openConnectedGmailDrafts() {
    const email = gmailDraftState().email;
    window.open(`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}#drafts`, "_blank", "noopener");
  }

  globalThis.connectGmailProfessional = connectGmailProfessional;
  globalThis.disconnectGmailProfessional = disconnectGmailProfessional;
  globalThis.gmailDraftState = gmailDraftState;
  globalThis.ensureGmailProfessional = ensureGmailProfessional;
  globalThis.createGmailDraft = createGmailDraft;
  globalThis.createGmailDrafts = createGmailDrafts;
  globalThis.openConnectedGmailDrafts = openConnectedGmailDrafts;
})();
