import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { Buffer } from "node:buffer";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GMAIL_USER = Deno.env.get("EPS_GMAIL_USER")!;
const GMAIL_APP_PASSWORD = Deno.env.get("EPS_GMAIL_APP_PASSWORD")!;
const WEB_ORIGIN = Deno.env.get("EPS_WEB_ORIGIN") || "";

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) throw new Error("EPS_GMAIL_USER et EPS_GMAIL_APP_PASSWORD sont obligatoires");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const mailer = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD.replace(/\s+/g, "") }
});
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUDIENCES = new Set(["students", "parents", "both", "parents_personalized"]);
const RECIPIENT_FILTERS = new Set(["all_retained", "missing_certificate", "missing_payment", "host_available"]);

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function cors(origin: string | null) {
  const headers: Record<string,string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
  if (origin && (!WEB_ORIGIN || origin === WEB_ORIGIN)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function emails(value: unknown) {
  return [...new Set(String(value || "").split(/[;,\s]+/).map(v => v.trim().toLowerCase()).filter(v => EMAIL.test(v)))];
}

function formatFirstName(value: unknown) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/(^|[\s'’\-])([a-zà-öø-ÿ])/g, (_match, separator, letter) => `${separator}${letter.toLocaleUpperCase("fr-FR")}`);
}

function replaceTokens(text: string, student: Record<string,unknown>, slot: Record<string,unknown>, activityList = "") {
  const first = formatFirstName(student.first_name);
  const last = String(student.last_name || "").trim().toLocaleUpperCase("fr-FR");
  const child = `${last} ${first}`.trim();
  const schoolClass = String(student.division || student.school_class_label || student.class_label || "Classe non renseignée").trim();
  const time = [slot.start_time, slot.end_time].filter(Boolean).join("–");
  return text
    .replaceAll("{prenom}", first).replaceAll("{nom}", last).replaceAll("{enfant}", child)
    .replaceAll("{classe}", schoolClass)
    .replaceAll("{creneaux}", activityList)
    .replaceAll("{activité}", String(slot.activity_name || "Association Sportive"))
    .replaceAll("{horaire}", time).replaceAll("{professeur}", String(slot.responsible_teacher || "Professeur EPS"));
}

function frenchTime(value: unknown) {
  const raw = String(value || "").trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!match) return raw;
  return `${Number(match[1])}h${match[2] === "00" ? "" : match[2]}`;
}

function activityLine(slot: Record<string,unknown>) {
  const activity = String(slot.activity_name || "Activité AS").trim();
  const rawDay = String(slot.day_of_week || "").trim().toLocaleLowerCase("fr-FR");
  const day = rawDay ? rawDay.charAt(0).toLocaleUpperCase("fr-FR") + rawDay.slice(1) : "Jour à préciser";
  const start = frenchTime(slot.start_time), end = frenchTime(slot.end_time);
  const hours = start && end ? ` de ${start} à ${end}` : start ? ` à ${start}` : "";
  return `• ${activity} — ${day}${hours}`;
}

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && WEB_ORIGIN && origin !== WEB_ORIGIN) return reply({ error: "Origine refusee" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "POST requis" }, 405);

  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  if (!match) return reply({ error: "Connexion requise" }, 401);
  const { data: userData, error: userError } = await auth.auth.getUser(match[1]);
  const user = userData?.user;
  if (userError || !user) return reply({ error: "Connexion expiree" }, 401);

  let input: Record<string,any>;
  try { input = await req.json(); } catch { return reply({ error: "Corps JSON invalide" }, 400); }
  const slotId = String(input.slotId || "");
  const audience = String(input.audience || "");
  const subject = String(input.subject || "").trim();
  const message = String(input.message || "").trim();
  const globalMode = String(input.mode || "") === "global_confirmations";
  if ((!globalMode && !slotId) || !AUDIENCES.has(audience) || !subject || !message) return reply({ error: "Destinataires, objet et message sont obligatoires" }, 400);
  if (subject.length > 180 || message.length > 8000) return reply({ error: "Message trop long" }, 400);

  const attachment = input.attachment || null;
  if (attachment) {
    if (!["application/pdf", "image/png", "image/jpeg"].includes(String(attachment.type))) return reply({ error: "Type de pièce jointe refusé" }, 400);
    if (!attachment.content || String(attachment.content).length > 4_300_000) return reply({ error: "Pièce jointe trop volumineuse" }, 400);
  }

  const teacherEmail = EMAIL.test(String(user.email || "").trim()) ? String(user.email).trim().toLowerCase() : GMAIL_USER;
  if (globalMode) {
    const recipientFilter = String(input.recipientFilter || "all_retained");
    if (!RECIPIENT_FILTERS.has(recipientFilter)) return reply({ error: "Groupe de destinataires invalide" }, 400);
    const { data: adminContext, error: adminError } = await admin.rpc("eps_admin_target", { p_actor: user.id });
    const institutionId = adminContext?.institution_id;
    if (adminError || !institutionId) return reply({ error: "L’envoi global est réservé à l’administrateur de l’établissement" }, 403);

    const { data: slots, error: slotsError } = await admin.from("unss_slots")
      .select("id,activity_name,day_of_week,start_time,end_time,responsible_teacher")
      .eq("institution_id", institutionId).eq("deleted", false);
    if (slotsError) return reply({ error: slotsError.message }, 500);
    const slotById = new Map((slots || []).map(slot => [slot.id, slot]));
    const slotIds = [...slotById.keys()];
    let memberships: Array<{student_id:string;slot_id:string}> = [];
    if (slotIds.length) {
      const { data, error: membershipsError } = await admin.from("unss_memberships")
        .select("student_id,slot_id").in("slot_id", slotIds).eq("deleted", false);
      if (membershipsError) return reply({ error: membershipsError.message }, 500);
      memberships = data || [];
    }
    const slotsByStudent = new Map<string,Array<Record<string,unknown>>>();
    for (const membership of memberships) {
      const slot = slotById.get(membership.slot_id);
      if (!slot || !membership.student_id) continue;
      const list = slotsByStudent.get(membership.student_id) || [];
      if (!list.some(item => item.id === slot.id)) list.push(slot);
      slotsByStudent.set(membership.student_id, list);
    }
    const studentIds = [...slotsByStudent.keys()];
    if (recipientFilter === "all_retained" && !studentIds.length) return reply({ ok: true, sent: 0, failed: 0, missing: [] });
    let studentsQuery = admin.from("unss_students")
      .select("id,last_name,first_name,division,student_email,parent_email")
      .eq("institution_id", institutionId).eq("deleted", false).eq("licensed", true);
    if (recipientFilter === "all_retained") studentsQuery = studentsQuery.in("id", studentIds);
    if (recipientFilter === "missing_certificate") studentsQuery = studentsQuery.eq("medical_certificate_missing", true);
    if (recipientFilter === "missing_payment") studentsQuery = studentsQuery.eq("payment_missing", true);
    if (recipientFilter === "host_available") studentsQuery = studentsQuery.eq("host_available", true);
    const { data: students, error: studentsError } = await studentsQuery;
    if (studentsError) return reply({ error: studentsError.message }, 500);

    type GlobalDelivery = { recipient: string; student: Record<string,unknown>; slots: Array<Record<string,unknown>> };
    const deliveries: GlobalDelivery[] = [], missing: Array<{id:unknown,name:string}> = [], seen = new Set<string>();
    for (const student of students || []) {
      const studentEmails = emails(student.student_email), parentEmails = emails(student.parent_email);
      const chosen = audience === "students" ? studentEmails : audience === "parents" || audience === "parents_personalized" ? parentEmails : [...studentEmails, ...parentEmails];
      if (!chosen.length) missing.push({ id: student.id, name: `${student.first_name || ""} ${student.last_name || ""}`.trim() });
      for (const recipient of chosen) {
        const key = `${student.id}|${recipient}`;
        if (!seen.has(key)) { seen.add(key); deliveries.push({ recipient, student, slots: slotsByStudent.get(String(student.id)) || [] }); }
      }
    }
    if (deliveries.length > 150) return reply({ error: "Plus de 150 e-mails : réduisez le nombre de destinataires" }, 400);

    let sent = 0, failed = 0;
    const failures: Array<{recipient:string,error:string}> = [];
    for (let start = 0; start < deliveries.length; start += 2) {
      const batch = deliveries.slice(start, start + 2);
      await Promise.all(batch.map(async delivery => {
        try {
          const orderedSlots = [...delivery.slots].sort((a, b) => activityLine(a).localeCompare(activityLine(b), "fr"));
          const activityList = orderedSlots.map(activityLine).join("\n");
          const referenceSlot = orderedSlots[0] || {};
          const personalizedSubject = replaceTokens(subject, delivery.student, referenceSlot, activityList);
          const personalizedMessage = replaceTokens(message, delivery.student, referenceSlot, activityList);
          const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#173a57">${personalizedMessage.split(/\r?\n/).map(line => line ? `<p style="margin:0 0 10px">${escapeHtml(line)}</p>` : `<div style="height:6px"></div>`).join("")}</div>`;
          await mailer.sendMail({
            from: `"ASLVH" <${GMAIL_USER}>`, to: delivery.recipient, replyTo: teacherEmail,
            subject: personalizedSubject, html,
            attachments: attachment ? [{ filename: String(attachment.name || "document"), content: Buffer.from(String(attachment.content), "base64"), contentType: String(attachment.type) }] : undefined
          });
          sent++;
        } catch (error) { failed++; failures.push({ recipient: delivery.recipient, error: String(error).slice(0, 300) }); }
      }));
      if (start + 2 < deliveries.length) await new Promise(resolve => setTimeout(resolve, 550));
    }
    return reply({ ok: failed === 0, sent, failed, missing, failures });
  }

  const { data: slot, error: slotError } = await admin.from("unss_slots")
    .select("id,user_id,assigned_teacher_id,activity_name,day_of_week,start_time,end_time,responsible_teacher,deleted")
    .eq("id", slotId).maybeSingle();
  if (slotError) return reply({ error: slotError.message }, 500);
  if (!slot || slot.deleted) return reply({ error: "Créneau introuvable" }, 404);
  const autorise = slot.assigned_teacher_id ? slot.assigned_teacher_id === user.id : slot.user_id === user.id;
  if (!autorise) return reply({ error: "Ce créneau est attribué à un autre professeur" }, 403);
  const { data: memberships, error: membershipError } = await admin.from("unss_memberships")
    .select("student_id").eq("slot_id", slotId).eq("deleted", false);
  if (membershipError) return reply({ error: membershipError.message }, 500);
  const ids = [...new Set((memberships || []).map(m => m.student_id).filter(Boolean))];
  if (!ids.length) return reply({ ok: true, sent: 0, failed: 0, missing: [] });
  const { data: students, error: studentError } = await admin.from("unss_students")
    .select("id,last_name,first_name,division,student_email,parent_email").in("id", ids).eq("deleted", false);
  if (studentError) return reply({ error: studentError.message }, 500);

  type Delivery = { recipient: string; student: Record<string,unknown> };
  const deliveries: Delivery[] = [], missing: Array<{id:unknown,name:string}> = [], seen = new Set<string>();
  for (const student of students || []) {
    const studentEmails = emails(student.student_email), parentEmails = emails(student.parent_email);
    const chosen = audience === "students" ? studentEmails : audience === "parents" || audience === "parents_personalized" ? parentEmails : [...studentEmails, ...parentEmails];
    if (!chosen.length) missing.push({ id: student.id, name: `${student.first_name || ""} ${student.last_name || ""}`.trim() });
    for (const recipient of chosen) {
      const key = audience === "parents_personalized" ? `${student.id}|${recipient}` : recipient;
      if (!seen.has(key)) { seen.add(key); deliveries.push({ recipient, student }); }
    }
  }
  if (deliveries.length > 150) return reply({ error: "Plus de 150 e-mails : réduisez le nombre de destinataires" }, 400);

  let sent = 0, failed = 0;
  const failures: Array<{recipient:string,error:string}> = [];
  for (let start = 0; start < deliveries.length; start += 2) {
    const batch = deliveries.slice(start, start + 2);
    await Promise.all(batch.map(async delivery => {
      try {
        const personalizedSubject = replaceTokens(subject, delivery.student, slot);
        const personalizedMessage = replaceTokens(message, delivery.student, slot);
        const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#173a57">${personalizedMessage.split(/\r?\n/).map(line => line ? `<p style="margin:0 0 10px">${escapeHtml(line)}</p>` : `<div style="height:6px"></div>`).join("")}</div>`;
        await mailer.sendMail({
          from: `"ASLVH" <${GMAIL_USER}>`,
          to: delivery.recipient,
          replyTo: teacherEmail,
          subject: personalizedSubject,
          html,
          attachments: attachment ? [{
            filename: String(attachment.name || "document"),
            content: Buffer.from(String(attachment.content), "base64"),
            contentType: String(attachment.type)
          }] : undefined
        });
        sent++;
      } catch (error) {
        failed++; failures.push({ recipient: delivery.recipient, error: String(error).slice(0, 300) });
      }
    }));
    if (start + 2 < deliveries.length) await new Promise(resolve => setTimeout(resolve, 550));
  }
  return reply({ ok: failed === 0, sent, failed, missing, failures });
});
