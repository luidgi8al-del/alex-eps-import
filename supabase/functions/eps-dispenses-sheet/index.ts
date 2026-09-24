/*
 * Passerelle entre les dispenses et le Google Sheet partage avec l'infirmerie.
 *
 * La base reste la reference : le Sheet en est un miroir, dans les deux sens.
 *   - "lister"   : le Sheet demande l'etat des dispenses et se reecrit avec (toutes les N minutes).
 *   - "ecrire"   : l'infirmerie saisit une ligne, le Sheet l'envoie ici, elle entre dans la base.
 *   - "supprimer": une ligne retiree du Sheet efface la dispense correspondante.
 *
 * Pourquoi une fonction plutot qu'un appel direct a PostgREST depuis le Sheet : une cle de base
 * collee dans un script Google serait lisible par toute personne ayant acces au fichier, et
 * donnerait bien plus que les dispenses. Ici le Sheet ne connait qu'un secret partage, qui
 * n'ouvre que cette porte, et cette porte ne sait faire que trois choses, sur les seules
 * dispenses du compte configure.
 *
 * Le motif medical fait partie de ce qui transite : c'est ce que l'infirmerie a besoin de
 * connaitre, c'est son role. Le Sheet doit donc rester partage avec elle seule.
 *
 * Secrets a poser (Supabase > Edge Functions > Secrets) :
 *   EPS_SHEET_SECRET   un mot de passe long, invente, partage avec le script du Sheet
 *   EPS_SHEET_USER_ID  l'identifiant du compte enseignant dont les dispenses sont miroitees
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHEET_SECRET = Deno.env.get("EPS_SHEET_SECRET") || "";
const SHEET_USER_ID = Deno.env.get("EPS_SHEET_USER_ID") || "";

if (!SHEET_SECRET || !SHEET_USER_ID) {
  throw new Error("EPS_SHEET_SECRET et EPS_SHEET_USER_ID sont obligatoires");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const entetes = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

/**
 * Comparaison de noms tolerante : l'infirmerie ecrit "Dupont Lea", la base connait "DUPONT Lea"
 * avec ses accents. Accents, tirets, apostrophes et casse ne doivent pas empecher de reconnaitre
 * le meme eleve.
 */
function cleNom(valeur: string) {
  return String(valeur || "")
    .normalize("NFD").replace(/\p{M}+/gu, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Un motif libre, ramene a l'une des familles acceptees par la base (voir schema_sante_2.sql). */
const FAMILLES = ["BLESSURE", "MALADIE", "CERTIFICAT", "AUTRE"];
function familleMotif(valeur: string) {
  const v = String(valeur || "").toUpperCase();
  return FAMILLES.find(f => v.includes(f)) || null;
}

/** Idem pour l'aptitude (voir schema_sante_4_sport_adapte.sql). Vide = non renseigne. */
function aptitudeDepuis(valeur: string) {
  const v = String(valeur || "").toUpperCase();
  if (!v.trim()) return null;
  return v.includes("ADAPT") ? "SPORT_ADAPTE" : "INAPTE_TOTAL";
}
const APTITUDE_LISIBLE: Record<string, string> = {
  INAPTE_TOTAL: "Inapte à toute pratique",
  SPORT_ADAPTE: "Sport adapté possible"
};

/** La naissance est stockee en millisecondes : le Sheet, lui, veut une date lisible. */
function jourDepuisMillis(millis: unknown) {
  const n = Number(millis);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(n).toISOString().slice(0, 10);
}

/**
 * Les eleves du compte configure, et eux seuls.
 *
 * Le filtre par user_id compte autant ici que pour les dispenses : la fonction travaille avec la
 * cle de service, qui ignore les regles de la base. Sans lui, une homonymie avec l'eleve d'un
 * collegue suffirait a poser la dispense sur le mauvais dossier.
 */
async function elevesDuCompte() {
  const { data: eleves, error } = await admin
    .from("students")
    .select("id, last_name, first_name, class_id, birth_date_epoch_millis")
    .eq("user_id", SHEET_USER_ID).eq("deleted", false);
  if (error) throw new Error(error.message);
  const { data: classes } = await admin.from("classes")
    .select("id, name").eq("user_id", SHEET_USER_ID).eq("deleted", false);
  const nomClasse = new Map<string, string>((classes || []).map(c => [c.id, c.name]));
  return { eleves: eleves || [], nomClasse };
}

Deno.serve(async (req) => {
  const repondre = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), { status, headers: entetes });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: entetes });
  if (req.method !== "POST") return repondre({ error: "POST requis" }, 405);

  let requete: Record<string, unknown>;
  try { requete = await req.json(); } catch { return repondre({ error: "JSON attendu" }, 400); }

  // Le secret ne circule que dans le corps, jamais dans l'URL : une URL se retrouve dans les
  // journaux d'acces, l'historique du navigateur et les captures d'ecran.
  if (String(requete.secret || "") !== SHEET_SECRET) return repondre({ error: "Secret refuse" }, 401);

  const action = String(requete.action || "");

  // ---- Eleves : de quoi remplir la liste deroulante du Sheet ----------------------------------
  // Taper un nom et le choisir vaut mieux que le saisir : l'infirmerie n'a pas a deviner
  // l'orthographe exacte, et la classe comme la naissance se remplissent d'elles-memes.
  if (action === "eleves") {
    let contenu;
    try { contenu = await elevesDuCompte(); }
    catch (e) { return repondre({ error: (e as Error).message }, 500); }
    const lignes = contenu.eleves.map(e => {
      const nom = `${String(e.last_name || "").toUpperCase()} ${e.first_name || ""}`.trim();
      const classe = contenu.nomClasse.get(e.class_id) || "";
      return {
        // Le libelle est ce qui s'affiche dans la liste : nom ET classe, pour departager
        // deux eleves qui portent le meme nom.
        libelle: classe ? `${nom} — ${classe}` : nom,
        nom, classe, naissance: jourDepuisMillis(e.birth_date_epoch_millis)
      };
    }).sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
    return repondre({ lignes });
  }

  // ---- Lister : le Sheet se reecrit avec l'etat de la base -------------------------------------
  if (action === "lister") {
    const { data, error } = await admin
      .from("health_dispensations")
      .select("id, class_id, student_id, start_date, end_date, reason, reason_kind, aptitude, adapted_activities, updated_at")
      .eq("user_id", SHEET_USER_ID)
      // Une suppression ne retire pas la ligne, elle la marque effacee : c'est ce qui fait
      // disparaitre la dispense sur tous les appareils. Sans ce filtre, le Sheet ressuscitait
      // ce que l'on venait d'effacer.
      .eq("deleted", false)
      .order("start_date", { ascending: false });
    if (error) return repondre({ error: error.message }, 500);

    const idsClasses = [...new Set((data || []).map(d => d.class_id))];
    const idsEleves = [...new Set((data || []).map(d => d.student_id))];
    const classes = new Map<string, string>();
    const eleves = new Map<string, { nom: string; classe: string; naissance: string }>();
    if (idsClasses.length) {
      const { data: cs } = await admin.from("classes").select("id, name").in("id", idsClasses);
      (cs || []).forEach(c => classes.set(c.id, c.name));
    }
    if (idsEleves.length) {
      const { data: es } = await admin.from("students")
        .select("id, last_name, first_name, class_id, birth_date_epoch_millis").in("id", idsEleves);
      (es || []).forEach(e => eleves.set(e.id, {
        nom: `${String(e.last_name || "").toUpperCase()} ${e.first_name || ""}`.trim(),
        classe: classes.get(e.class_id) || "",
        naissance: jourDepuisMillis(e.birth_date_epoch_millis)
      }));
    }

    return repondre({
      lignes: (data || []).map(d => {
        const nom = eleves.get(d.student_id)?.nom || "(élève retiré)";
        const classe = classes.get(d.class_id) || eleves.get(d.student_id)?.classe || "";
        return {
          id: d.id,
          // Le Sheet ecrit le libelle, pas le nom seul : c'est ce que propose sa liste deroulante,
          // et une cellule qui n'y figure pas se couvre d'un avertissement a chaque ligne.
          eleve: classe ? `${nom} — ${classe}` : nom,
          nom,
          classe,
          naissance: eleves.get(d.student_id)?.naissance || "",
          debut: d.start_date, fin: d.end_date,
          famille: d.reason_kind || "", motif: d.reason || "",
          aptitude: APTITUDE_LISIBLE[d.aptitude || ""] || "",
          adapte: d.adapted_activities || "",
          modifie: d.updated_at
        };
      })
    });
  }

  // ---- Ecrire : une ligne saisie ou corrigee dans le Sheet entre dans la base ------------------
  if (action === "ecrire") {
    const ligne = (requete.ligne || {}) as Record<string, string>;
    const debut = String(ligne.debut || "").slice(0, 10);
    const fin = String(ligne.fin || debut).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(debut) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
      return repondre({ error: "Dates attendues au format AAAA-MM-JJ" }, 400);
    }
    if (fin < debut) return repondre({ error: "La date de fin precede la date de debut" }, 400);

    // Retrouver l'eleve par son nom, dans la classe indiquee quand elle l'est. Sans identifiant
    // c'est le seul rattachement possible - et il doit echouer clairement plutot qu'a moitie,
    // sinon une dispense se poserait sur le mauvais eleve sans que personne le voie.
    let contenu;
    try { contenu = await elevesDuCompte(); }
    catch (e) { return repondre({ error: (e as Error).message }, 500); }
    const { eleves } = contenu;
    const nomClasse = (id: string) => contenu.nomClasse.get(id) || "";

    const cherche = cleNom(ligne.eleve || "");
    const classeVoulue = cleNom(ligne.classe || "");
    const candidats = (eleves || []).filter(e => {
      // "DUPONT Lea" comme "Lea DUPONT" : on accepte les deux ordres.
      const direct = cleNom(`${e.last_name || ""} ${e.first_name || ""}`);
      const inverse = cleNom(`${e.first_name || ""} ${e.last_name || ""}`);
      if (cherche !== direct && cherche !== inverse) return false;
      return !classeVoulue || cleNom(nomClasse(e.class_id)) === classeVoulue;
    });
    if (!candidats.length) return repondre({ error: `Élève introuvable : « ${ligne.eleve || ""} »` }, 404);
    if (candidats.length > 1) {
      return repondre({ error: "Plusieurs élèves portent ce nom : précisez la classe" }, 409);
    }
    const eleve = candidats[0];

    const maintenant = new Date().toISOString();
    const corps = {
      user_id: SHEET_USER_ID,
      class_id: eleve.class_id,
      student_id: eleve.id,
      start_date: debut,
      end_date: fin,
      reason: String(ligne.motif || "") || null,
      reason_kind: familleMotif(String(ligne.famille || ligne.motif || "")),
      aptitude: aptitudeDepuis(String(ligne.aptitude || "")),
      adapted_activities: String(ligne.adapte || "") || null,
      updated_at: maintenant
    };

    // Un identifiant deja present veut dire que la ligne existe : on la corrige. Sinon on cree, et
    // on rend l'identifiant au Sheet - sans quoi la meme ligne serait recreee a chaque edition.
    const id = String(ligne.id || "").trim();
    if (id) {
      const { error } = await admin.from("health_dispensations")
        .update(corps).eq("id", id).eq("user_id", SHEET_USER_ID);
      if (error) return repondre({ error: error.message }, 500);
      return repondre({ id, statut: "corrigée" });
    }
    const { data, error } = await admin.from("health_dispensations")
      .insert({ ...corps, created_at: maintenant }).select("id").single();
    if (error) return repondre({ error: error.message }, 500);
    return repondre({ id: data.id, statut: "ajoutée" });
  }

  // ---- Supprimer : une ligne retiree du Sheet efface la dispense -------------------------------
  if (action === "supprimer") {
    const id = String(requete.id || "").trim();
    if (!id) return repondre({ error: "Identifiant manquant" }, 400);
    const { error } = await admin.from("health_dispensations")
      .delete().eq("id", id).eq("user_id", SHEET_USER_ID);
    if (error) return repondre({ error: error.message }, 500);
    return repondre({ statut: "supprimée" });
  }

  return repondre({ error: "Action inconnue" }, 400);
});
