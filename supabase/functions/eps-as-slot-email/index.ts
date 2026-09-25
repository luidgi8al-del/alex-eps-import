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

function replaceTokens(text: string, student: Record<string,unknown>, slot: Record<string,unknown>) {
  const first = String(student.first_name || "").trim();
  const last = String(student.last_name || "").trim();
  const child = `${first} ${last}`.trim();
  const time = [slot.start_time, slot.end_time].filter(Boolean).join("–");
  return text
    .replaceAll("{prenom}", first).replaceAll("{nom}", last).replaceAll("{enfant}", child)
    .replaceAll("{activité}", String(slot.activity_name || "Association Sportive"))
    .replaceAll("{horaire}", time).replaceAll("{professeur}", String(slot.responsible_teacher || "Professeur EPS"));
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
  if (!slotId || !AUDIENCES.has(audience) || !subject || !message) return reply({ error: "Créneau, destinataires, objet et message sont obligatoires" }, 400);
  if (subject.length > 180 || message.length > 8000) return reply({ error: "Message trop long" }, 400);

  const attachment = input.attachment || null;
  if (attachment) {
    if (!["application/pdf", "image/png", "image/jpeg"].includes(String(attachment.type))) return reply({ error: "Type de pièce jointe refusé" }, 400);
    if (!attachment.content || String(attachment.content).length > 4_300_000) return reply({ error: "Pièce jointe trop volumineuse" }, 400);
  }

  const { data: slot, error: slotError } = await admin.from("unss_slots")
    .select("id,user_id,assigned_teacher_id,activity_name,day_of_week,start_time,end_time,responsible_teacher,deleted")
    .eq("id", slotId).maybeSingle();
  if (slotError) return reply({ error: slotError.message }, 500);
  if (!slot || slot.deleted) return reply({ error: "Créneau introuvable" }, 404);
  const autorise = slot.assigned_teacher_id ? slot.assigned_teacher_id === user.id : slot.user_id === user.id;
  if (!autorise) return reply({ error: "Ce créneau est attribué à un autre professeur" }, 403);
  const teacherEmail = EMAIL.test(String(user.email || "").trim()) ? String(user.email).trim().toLowerCase() : GMAIL_USER;

  const { data: memberships, error: membershipError } = await admin.from("unss_memberships")
    .select("student_id").eq("slot_id", slotId).eq("deleted", false);
  if (membershipError) return reply({ error: membershipError.message }, 500);
  const ids = [...new Set((memberships || []).map(m => m.student_id).filter(Boolean))];
  if (!ids.length) return reply({ ok: true, sent: 0, failed: 0, missing: [] });
  const { data: students, error: studentError } = await admin.from("unss_students")
    .select("id,last_name,first_name,student_email,parent_email").in("id", ids).eq("deleted", false);
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
