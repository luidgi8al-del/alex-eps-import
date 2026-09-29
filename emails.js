(function () {
  "use strict";

  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const reasonLabels = {
    free: "Raison libre", cancelled: "Annulation AS", missing_certificate: "Certificat médical manquant",
    missing_payment: "Frais d’inscription manquants", confirmation: "Confirmation d’inscription",
    host_available: "Hébergement"
  };
  const audienceLabels = {
    students: "Élèves", parents: "Parents", parents_personalized: "Parents", both: "Élèves et parents"
  };
  const statusLabels = { sending: "En cours", sent: "Envoyé", partial: "Partiel", failed: "Échec" };
  let emailHubView = "compose";
  let emailHubReady = false;
  let emailHistoryScope = "mine";
  let emailHistoryAdmin = false;

  function formatDate(value) {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? "Date inconnue" : date.toLocaleString("fr-FR", {
      weekday: "short", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  async function historyRequest(path, options = {}) {
    const response = await apiFetch(`${SUPABASE_URL}/rest/v1/${path}`, options);
    if (!response.ok) {
      let message = "Historique indisponible";
      try { const body = await response.json(); message = body.message || body.error || message; } catch {}
      throw new Error(message);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function createEmailHistoryCampaign(data) {
    const id = String(data.id || crypto.randomUUID());
    await historyRequest("eps_email_campaigns", {
      method: "POST",
      headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
      body: JSON.stringify({
        id, user_id: session.user_id, sender_email: data.senderEmail || session.email || "",
        sender_name: data.senderName || "", source: data.source || "AS", channel: data.channel || "as_account",
        reason: data.reason || "free", recipient_filter: data.recipientFilter || "", audience: data.audience || "",
        subject: data.subject || "", message_template: data.message || "", attachment_name: data.attachmentName || null,
        status: "sending"
      })
    });
    return id;
  }

  async function recordEmailHistoryDeliveries(campaignId, deliveries) {
    if (!deliveries?.length) return;
    const rows = deliveries.map(item => ({
      campaign_id: campaignId, student_id: String(item.studentId || "") || null,
      student_name: item.studentName || "", division: item.division || "",
      recipient_email: item.recipient || item.to || null, recipient_type: item.recipientType || "unknown",
      subject_text: item.subject || "", message_text: item.message || "", status: item.status || "sent",
      error_message: item.error || null, sent_at: item.status === "sent" ? new Date().toISOString() : null
    }));
    await historyRequest("eps_email_deliveries?on_conflict=campaign_id,student_id,recipient_email", {
      method: "POST", headers: { Prefer: "return=minimal,resolution=merge-duplicates" }, body: JSON.stringify(rows)
    });
  }

  async function completeEmailHistoryCampaign(campaignId, summary = {}) {
    const sent = Number(summary.sent || 0), failed = Number(summary.failed || 0), missing = Number(summary.missing || 0);
    const status = summary.status || (failed ? (sent ? "partial" : "failed") : "sent");
    await historyRequest(`eps_email_campaigns?id=eq.${encodeURIComponent(campaignId)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
        status, sent_count: sent, failed_count: failed, missing_count: missing, completed_at: new Date().toISOString()
      })
    });
  }

  function setEmailHubView(view) {
    emailHubView = view;
    document.querySelectorAll("[data-email-hub-view]").forEach(button =>
      button.classList.toggle("active", button.dataset.emailHubView === view));
    document.getElementById("emailHubCompose").hidden = view !== "compose";
    document.getElementById("emailHubHistory").hidden = view !== "history";
    if (view === "history") loadEmailHistory();
  }

  async function openEmailComposerFromHub() {
    const button = document.getElementById("emailHubComposeButton");
    button.disabled = true;
    button.textContent = "Ouverture…";
    try {
      if (typeof globalThis.ouvrirNouvelEmailAS !== "function") throw new Error("Le module AS n’est pas encore prêt.");
      await globalThis.ouvrirNouvelEmailAS();
    } catch (error) {
      document.getElementById("emailHubComposeError").textContent = error.message || "Ouverture impossible.";
    } finally {
      button.disabled = false;
      button.textContent = "Écrire un e-mail AS";
    }
  }

  function renderCampaigns(rows) {
    const list = document.getElementById("emailHistoryList");
    if (!rows.length) {
      list.innerHTML = `<div class="email-empty"><strong>Aucun e-mail envoyé pour le moment</strong><span>Les prochains envois AS apparaîtront ici avec leur bilan.</span></div>`;
      return;
    }
    list.innerHTML = rows.map(item => `<button type="button" class="email-campaign-card" data-email-campaign="${escapeHtml(item.id)}">
      <span class="email-campaign-main"><small>${escapeHtml(reasonLabels[item.reason] || item.reason || "Information AS")}</small><strong>${escapeHtml(item.subject)}</strong><span>${escapeHtml(formatDate(item.created_at))} · ${escapeHtml(item.sender_name || item.sender_email || "Expéditeur non renseigné")}</span></span>
      <span class="email-campaign-stats"><b class="status ${escapeHtml(item.status)}">${escapeHtml(statusLabels[item.status] || item.status)}</b><span>${Number(item.sent_count || 0)} envoyé(s)${item.failed_count ? ` · ${Number(item.failed_count)} échec(s)` : ""}</span><span>Voir le détail ›</span></span>
    </button>`).join("");
    list.querySelectorAll("[data-email-campaign]").forEach(button => button.onclick = () => openCampaign(button.dataset.emailCampaign));
  }

  async function loadEmailHistory() {
    const list = document.getElementById("emailHistoryList");
    list.innerHTML = `<div class="email-loading">Chargement de l’historique…</div>`;
    try {
      const ownFilter = !emailHistoryAdmin || emailHistoryScope === "mine"
        ? `&user_id=eq.${encodeURIComponent(session.user_id)}` : "";
      const rows = await historyRequest(`eps_email_campaigns?select=*&order=created_at.desc&limit=200${ownFilter}`);
      renderCampaigns(rows || []);
    } catch (error) {
      list.innerHTML = `<div class="email-history-error"><strong>L’historique n’est pas encore disponible.</strong><span>${escapeHtml(error.message)}</span><span>La mise à jour Supabase « email_history » doit être appliquée une seule fois.</span></div>`;
    }
  }

  async function openCampaign(id) {
    const overlay = document.getElementById("emailHistoryOverlay");
    const body = document.getElementById("emailHistoryDetail");
    overlay.classList.add("open");
    body.innerHTML = `<div class="email-loading">Chargement du détail…</div>`;
    try {
      const [campaigns, deliveries] = await Promise.all([
        historyRequest(`eps_email_campaigns?id=eq.${encodeURIComponent(id)}&select=*&limit=1`),
        historyRequest(`eps_email_deliveries?campaign_id=eq.${encodeURIComponent(id)}&select=*&order=student_name.asc,recipient_email.asc`)
      ]);
      const campaign = campaigns?.[0];
      if (!campaign) throw new Error("Cet envoi est introuvable.");
      const recipients = deliveries || [];
      body.innerHTML = `<div class="email-detail-summary">
        <span class="email-detail-reason">${escapeHtml(reasonLabels[campaign.reason] || campaign.reason || "Information AS")}</span>
        <h2>${escapeHtml(campaign.subject)}</h2>
        <p>${escapeHtml(formatDate(campaign.created_at))} · envoyé par ${escapeHtml(campaign.sender_name || campaign.sender_email || "expéditeur non renseigné")}</p>
        <div class="email-detail-counts"><b>${Number(campaign.sent_count || 0)} envoyé(s)</b><b>${Number(campaign.failed_count || 0)} échec(s)</b><b>${Number(campaign.missing_count || 0)} sans adresse</b></div>
      </div>
      <section class="email-detail-message"><h3>Message préparé</h3><pre>${escapeHtml(campaign.message_template)}</pre>${campaign.attachment_name ? `<p>📎 ${escapeHtml(campaign.attachment_name)}</p>` : ""}</section>
      <section><h3>Destinataires et messages réellement envoyés</h3>${recipients.length ? recipients.map(item => `<details class="email-delivery ${escapeHtml(item.status)}"><summary><span><b>${escapeHtml(item.student_name || "Élève")}</b>${item.division ? ` · ${escapeHtml(item.division)}` : ""}<small>${escapeHtml(item.recipient_email || "Aucune adresse")}</small></span><strong>${item.status === "sent" ? "Envoyé" : item.status === "missing" ? "Sans adresse" : "Échec"}</strong></summary><div><b>${escapeHtml(item.subject_text || campaign.subject)}</b><pre>${escapeHtml(item.message_text || campaign.message_template)}</pre>${item.error_message ? `<p class="error">${escapeHtml(item.error_message)}</p>` : ""}</div></details>`).join("") : `<p>Aucun détail de destinataire n’a été enregistré.</p>`}</section>`;
    } catch (error) {
      body.innerHTML = `<div class="email-history-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function initEmailHub() {
    if (!emailHubReady) {
      if (!document.getElementById("emailHistoryOverlay")) {
        document.body.insertAdjacentHTML("beforeend", `<div class="ui-modal-overlay email-history-overlay" id="emailHistoryOverlay"><section class="ui-modal email-history-dialog" role="dialog" aria-modal="true" aria-label="Détail de l’e-mail"><header><div><small>HISTORIQUE</small><h2>Détail de l’envoi</h2></div><button type="button" data-email-history-close aria-label="Fermer">×</button></header><main class="email-history-detail" id="emailHistoryDetail"></main></section></div>`);
      }
      document.getElementById("emailHubNav").addEventListener("click", event => {
        const button = event.target.closest("[data-email-hub-view]");
        if (button) setEmailHubView(button.dataset.emailHubView);
      });
      document.getElementById("emailHubComposeButton").onclick = openEmailComposerFromHub;
      document.getElementById("emailHistoryRefresh").onclick = loadEmailHistory;
      document.getElementById("emailHistoryScope").addEventListener("click", event => {
        const button = event.target.closest("[data-email-history-scope]");
        if (!button || !emailHistoryAdmin) return;
        emailHistoryScope = button.dataset.emailHistoryScope;
        document.querySelectorAll("[data-email-history-scope]").forEach(item =>
          item.classList.toggle("active", item.dataset.emailHistoryScope === emailHistoryScope));
        document.getElementById("emailHistoryPrivacyText").textContent = emailHistoryScope === "mine"
          ? "Votre historique personnel d’envoi."
          : "Historique de tous les professeurs de votre établissement.";
        loadEmailHistory();
      });
      document.querySelectorAll("[data-email-history-close]").forEach(button => button.onclick = () =>
        document.getElementById("emailHistoryOverlay").classList.remove("open"));
      document.getElementById("emailHistoryOverlay").addEventListener("click", event => {
        if (event.target.id === "emailHistoryOverlay") event.currentTarget.classList.remove("open");
      });
      emailHubReady = true;
    }
    Promise.resolve(typeof estAdministrateur === "function" ? estAdministrateur() : false).then(isAdmin => {
      emailHistoryAdmin = Boolean(isAdmin);
      document.getElementById("emailHistoryScope").hidden = !emailHistoryAdmin;
      if (!emailHistoryAdmin && emailHistoryScope !== "mine") {
        emailHistoryScope = "mine";
        document.getElementById("emailHistoryPrivacyText").textContent = "Votre historique personnel d’envoi.";
        if (emailHubView === "history") loadEmailHistory();
      }
    }).catch(() => { emailHistoryAdmin = false; document.getElementById("emailHistoryScope").hidden = true; });
    setEmailHubView(emailHubView);
  }

  globalThis.initEmailHub = initEmailHub;
  globalThis.createEmailHistoryCampaign = createEmailHistoryCampaign;
  globalThis.recordEmailHistoryDeliveries = recordEmailHistoryDeliveries;
  globalThis.completeEmailHistoryCampaign = completeEmailHistoryCampaign;
})();
