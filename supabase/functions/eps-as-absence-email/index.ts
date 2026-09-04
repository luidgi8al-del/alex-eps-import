import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const EMAIL_FROM = Deno.env.get("EPS_EMAIL_FROM")!;
const REPLY_TO = Deno.env.get("EPS_EMAIL_REPLY_TO") || undefined;
const WEB_ORIGIN = Deno.env.get("EPS_WEB_ORIGIN") || "";
const TIME_ZONE = Deno.env.get("EPS_TIME_ZONE") || "Africa/Casablanca";

if (!RESEND_API_KEY || !EMAIL_FROM) throw new Error("RESEND_API_KEY et EPS_EMAIL_FROM sont obligatoires");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function headers(origin: string | null) {
  const h: Record<string,string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
  if (origin && (!WEB_ORIGIN || origin === WEB_ORIGIN)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = headers(origin);
  const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: h });
  if (origin && WEB_ORIGIN && origin !== WEB_ORIGIN) return reply({ error: "Origine refusee" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return reply({ error: "POST requis" }, 405);

  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  if (!match) return reply({ error: "Connexion requise" }, 401);
  const { data: userData, error: userError } = await auth.auth.getUser(match[1]);
  const user = userData?.user;
  if (userError || !user) return reply({ error: "Connexion expiree" }, 401);

  const { data: queue, error: queueError } = await admin.from("unss_absence_email_queue")
    .select("*").eq("user_id", user.id).in("status", ["pending", "failed"])
    .lt("attempts", 4).order("created_at").limit(50);
  if (queueError) return reply({ error: queueError.message }, 500);

  let sent = 0, failed = 0, cancelled = 0;
  for (const item of queue || []) {
    await admin.from("unss_absence_email_queue").update({ status: "sending", attempts: item.attempts + 1, last_error: null }).eq("id", item.id);
    try {
      const [{ data: attendance }, { data: session }, { data: student }] = await Promise.all([
        admin.from("unss_attendance").select("id,present,session_id,student_id,user_id").eq("id", item.attendance_id).maybeSingle(),
        admin.from("unss_sessions").select("id,group_id,date_epoch_millis").eq("id", item.session_id).maybeSingle(),
        admin.from("unss_students").select("id,last_name,first_name").eq("id", item.student_id).maybeSingle()
      ]);
      if (!attendance || attendance.present || attendance.user_id !== user.id || !session || !student) {
        await admin.from("unss_absence_email_queue").update({ status: "cancelled", last_error: null }).eq("id", item.id);
        cancelled++;
        continue;
      }
      const { data: group } = await admin.from("unss_groups").select("activity_name,start_time,responsible_teacher").eq("id", session.group_id).maybeSingle();
      const date = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, dateStyle: "full" }).format(new Date(Number(session.date_epoch_millis)));
      const studentName = `${student.first_name} ${student.last_name}`.trim();
      const activity = group?.activity_name || "Association Sportive";
      const teacher = group?.responsible_teacher || user.email || "Professeur EPS";
      const subject = `Absence AS - ${studentName} - ${date}`;
      const html = `<p>Bonjour,</p><p>Nous vous informons que <strong>${escapeHtml(studentName)}</strong> a ete declare(e) absent(e) a la seance <strong>${escapeHtml(activity)}</strong> du <strong>${escapeHtml(date)}</strong>${group?.start_time ? ` a <strong>${escapeHtml(group.start_time)}</strong>` : ""}.</p><p>Si cette absence vous parait incorrecte, merci de contacter l'etablissement.</p><p>Cordialement,<br>${escapeHtml(teacher)}<br>Association Sportive - Cite scolaire Victor-Hugo</p>`;
      const resend = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": String(item.id) },
        body: JSON.stringify({ from: EMAIL_FROM, to: [item.recipient], ...(REPLY_TO ? { reply_to: REPLY_TO } : {}), subject, html })
      });
      if (!resend.ok) throw new Error((await resend.text()).slice(0, 500));
      await admin.from("unss_absence_email_queue").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", item.id);
      sent++;
    } catch (error) {
      await admin.from("unss_absence_email_queue").update({ status: "failed", last_error: String(error).slice(0, 500) }).eq("id", item.id);
      failed++;
    }
  }
  return reply({ ok: true, sent, failed, cancelled, pending: (queue || []).length });
});
