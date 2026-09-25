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
 * Le perimetre est l'etablissement, pas un professeur : les dispenses se partagent entre
 * collegues, chacun voyant celles de tous. Le Sheet couvre donc les memes eleves et les memes
 * dispenses, sinon l'infirmerie ne pourrait rien saisir pour l'eleve d'un autre professeur.
 *
 * Secrets a poser (Supabase > Edge Functions > Secrets) :
 *   EPS_SHEET_SECRET   un mot de passe long, invente, partage avec le script du Sheet
 *   EPS_SHEET_USER_ID  un compte de l'etablissement : il sert a designer lequel, rien de plus
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

/**
 * Le nom des professeurs, par identifiant de compte.
 *
 * Le nom vit dans teacher_profiles, l'e-mail dans profiles : on prend le premier et on retombe
 * sur le second, pour qu'une colonne "Fait par" ne reste jamais vide.
 */
async function nomsEnseignants(): Promise<Map<string, string>> {
  const noms = new Map<string, string>();
  const { data: comptes } = await admin.from("profiles").select("id, email");
  (comptes || []).forEach(p => noms.set(p.id, p.email || ""));
  const { data: fiches } = await admin.from("teacher_profiles").select("user_id, profile");
  (fiches || []).forEach(f => {
    const nom = (f.profile as Record<string, unknown> | null)?.teacherName;
    if (typeof nom === "string" && nom.trim()) noms.set(f.user_id, nom.trim());
  });
  return noms;
}

/** La naissance est stockee en millisecondes : le Sheet, lui, veut une date lisible. */
function jourDepuisMillis(millis: unknown) {
  const n = Number(millis);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(n).toISOString().slice(0, 10);
}

/**
 * Le repertoire des eleves : tout l'etablissement, classe ou non.
 *
 * Un eleve n'entre dans "students" que le jour ou un professeur verse sa division dans sa classe.
 * Le repertoire, lui, les porte tous - avec leur division, c'est-a-dire leur vraie classe. C'est
 * donc lui qui alimente la liste deroulante.
 *
 * Lecture par tranches : PostgREST plafonne ce qu'il rend par requete, et le repertoire depasse
 * le millier de lignes. Sans cela la liste s'arreterait en silence au millieme eleve.
 */
async function repertoireComplet() {
  const taille = 1000;
  // deno-lint-ignore no-explicit-any
  const tout: any[] = [];
  for (let debut = 0; ; debut += taille) {
    const { data, error } = await admin
      .from("unss_students")
      .select("id, last_name, first_name, division, birth_date_epoch_millis")
      .eq("deleted", false)
      .order("last_name", { ascending: true }).order("first_name", { ascending: true })
      .range(debut, debut + taille - 1);
    if (error) throw new Error(error.message);
    tout.push(...(data || []));
    if (!data || data.length < taille) return tout;
  }
}

/**
 * Tous les eleves de classe, sans filtre de compte.
 *
 * Choix de l'administrateur de la base : le Sheet couvre le meme repertoire que celui qui sert
 * aux classes et aux licences AS. Les dispenses se partagent deja entre collegues - chacun voit
 * celles de tous - et l'infirmerie doit pouvoir saisir pour n'importe quel eleve, sans avoir a
 * savoir de quel professeur il depend.
 *
 * A savoir si la base venait a heberger un second etablissement : il faudrait revenir a un
 * filtre, sinon ce Sheet verrait ses eleves aussi.
 */
async function tousLesEleves() {
  const { data: eleves, error } = await admin
    .from("students")
    .select("id, user_id, last_name, first_name, class_id, birth_date_epoch_millis")
    .eq("deleted", false);
  if (error) throw new Error(error.message);
  const { data: classes } = await admin.from("classes")
    .select("id, name").eq("deleted", false);
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

  // ---- Diagnostic : d'ou vient l'ecart entre ce qu'on attend et ce qu'on voit -------------------
  // PostgREST plafonne le nombre de lignes rendues par defaut : une liste incomplete ressemble
  // alors a un filtre trop strict. Ce releve separe les deux causes au lieu de les confondre.
  // Recherche ciblee : ce que la passerelle voit reellement pour un nom donne, colonne par
  // colonne. Quand un eleve parait sans classe alors que le site lui en montre une, c'est la
  // seule facon de savoir si la difference vient de la base ou de ce qui a ete ecrit dans le Sheet.
  if (action === "cherche") {
    const quoi = cleNom(String(requete.nom || ""));
    if (!quoi) return repondre({ error: "Nom attendu" }, 400);
    let repertoire;
    try { repertoire = await repertoireComplet(); }
    catch (e) { return repondre({ error: (e as Error).message }, 500); }
    const trouves = repertoire
      .filter(e => cleNom(`${e.last_name} ${e.first_name}`).includes(quoi)
        || cleNom(`${e.first_name} ${e.last_name}`).includes(quoi))
      .slice(0, 10)
      .map(e => ({
        id: e.id,
        nom: `${String(e.last_name || "").toUpperCase()} ${e.first_name || ""}`.trim(),
        division_brute: e.division === null ? "(null)" : `"${e.division}"`,
        naissance: jourDepuisMillis(e.birth_date_epoch_millis)
      }));
    return repondre({ trouves, total_repertoire: repertoire.length });
  }

  if (action === "diagnostic") {
    const compter = async (table: string, filtres: (q: never) => never = (q) => q) => {
      // deno-lint-ignore no-explicit-any
      let q: any = admin.from(table).select("id", { count: "exact", head: true });
      q = filtres(q as never);
      const { count, error } = await q;
      return error ? `erreur : ${error.message}` : count;
    };

    const { data: page, error: erreurPage } = await admin
      .from("students").select("id, user_id").eq("deleted", false);
    const rendus = erreurPage ? -1 : (page || []).length;

    const parCompte: Record<string, number> = {};
    (page || []).forEach(e => {
      const c = String(e.user_id || "(sans compte)");
      parCompte[c] = (parCompte[c] || 0) + 1;
    });

    // Les autres tables ou vivent des eleves. Une dispense se rattache a un eleve de "students"
    // et a sa classe : un eleve qui n'existe que dans l'une de celles-ci ne peut pas en recevoir,
    // et c'est la seule explication qui reste quand la requete rend deja toute la table.
    const ailleurs: Record<string, unknown> = {};
    for (const t of ["unss_students", "pending_students"]) {
      ailleurs[t] = await compter(t).catch(() => "table absente");
    }

    // La division fait office de classe pour un eleve que personne n'a encore verse. Savoir
    // combien l'ont renseignee dit combien resteront sans classe dans la liste deroulante.
    let avecDivision = 0, sansDivision = 0;
    const exemplesSansDivision: string[] = [];
    try {
      (await repertoireComplet()).forEach(e => {
        if (String(e.division || "").trim()) { avecDivision++; return; }
        sansDivision++;
        if (exemplesSansDivision.length < 5) {
          exemplesSansDivision.push(`${String(e.last_name || "").toUpperCase()} ${e.first_name || ""}`.trim());
        }
      });
    } catch { /* le releve doit rendre ce qu'il peut, pas echouer en entier */ }

    return repondre({
      eleves_total_toutes_lignes: await compter("students"),
      ailleurs,
      // deno-lint-ignore no-explicit-any
      eleves_non_supprimes: await compter("students", ((q: any) => q.eq("deleted", false)) as never),
      eleves_rendus_par_la_requete: rendus,
      classes_non_supprimees:
        // deno-lint-ignore no-explicit-any
        await compter("classes", ((q: any) => q.eq("deleted", false)) as never),
      repertoire_avec_division: avecDivision,
      repertoire_sans_division: sansDivision,
      exemples_sans_division: exemplesSansDivision,
      comptes: Object.keys(parCompte).length,
      eleves_par_compte: parCompte,
      // Si "rendus" est inferieur a "non supprimes", c'est le plafond de lignes, pas un filtre.
      plafond_atteint: typeof rendus === "number" && rendus > 0 && rendus % 1000 === 0
    });
  }

  // ---- Eleves : de quoi remplir la liste deroulante du Sheet ----------------------------------
  // Taper un nom et le choisir vaut mieux que le saisir : l'infirmerie n'a pas a deviner
  // l'orthographe exacte, et la classe comme la naissance se remplissent d'elles-memes.
  if (action === "eleves") {
    let repertoire, contenuEleves;
    try {
      repertoire = await repertoireComplet();
      contenuEleves = await tousLesEleves();
    } catch (e) { return repondre({ error: (e as Error).message }, 500); }

    // La division n'est pas renseignee pour tout le monde. Quand elle manque, la classe du
    // professeur fait l'affaire : les deux tables se rapprochent par nom + prenom + naissance,
    // la meme cle que partout ailleurs dans l'application.
    const classeParEleve = new Map<string, string>();
    contenuEleves.eleves.forEach(e => {
      const cle = `${cleNom(`${e.last_name} ${e.first_name}`)}|${e.birth_date_epoch_millis ?? ""}`;
      const nomDeClasse = contenuEleves.nomClasse.get(e.class_id) || "";
      if (nomDeClasse) classeParEleve.set(cle, nomDeClasse);
    });

    const lignes = repertoire.map(e => {
      const nom = `${String(e.last_name || "").toUpperCase()} ${e.first_name || ""}`.trim();
      // La division EST la classe de l'eleve : il n'attend qu'un professeur pour l'y verser.
      const cle = `${cleNom(`${e.last_name} ${e.first_name}`)}|${e.birth_date_epoch_millis ?? ""}`;
      const classe = String(e.division || "").trim() || classeParEleve.get(cle) || "";
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
      .select("id, user_id, class_id, student_id, unss_student_id, student_last_name, student_first_name, class_name, start_date, end_date, reason, reason_kind, aptitude, adapted_activities, entered_by, updated_at")
      // Une suppression ne retire pas la ligne, elle la marque effacee : c'est ce qui fait
      // disparaitre la dispense sur tous les appareils. Sans ce filtre, le Sheet ressuscitait
      // ce que l'on venait d'effacer.
      .eq("deleted", false)
      .order("start_date", { ascending: false });
    if (error) return repondre({ error: error.message }, 500);

    const noms = await nomsEnseignants();
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
        // Une dispense posee sur un eleve du repertoire n'a ni classe ni eleve de classe : son
        // nom et sa division ont ete recopies au moment de l'ecriture, et servent de repli.
        const recopie = `${String(d.student_last_name || "").toUpperCase()} ${d.student_first_name || ""}`.trim();
        const nom = eleves.get(d.student_id)?.nom || recopie || "(élève retiré)";
        const classe = classes.get(d.class_id) || eleves.get(d.student_id)?.classe
          || d.class_name || "";
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
          // Qui l'a saisie : l'infirmerie depuis ce Sheet, ou le professeur lui-meme.
          auteur: d.entered_by === "INFIRMERIE" ? "Infirmerie" : (noms.get(d.user_id) || ""),
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
    let contenu, repertoire;
    try {
      contenu = await tousLesEleves();
      repertoire = await repertoireComplet();
    } catch (e) { return repondre({ error: (e as Error).message }, 500); }
    const { eleves } = contenu;
    const nomClasse = (id: string) => contenu.nomClasse.get(id) || "";

    const cherche = cleNom(ligne.eleve || "");
    const classeVoulue = cleNom(ligne.classe || "");
    /** "DUPONT Lea" comme "Lea DUPONT" : on accepte les deux ordres. */
    const memeNom = (nom: unknown, prenom: unknown) => {
      const direct = cleNom(`${nom || ""} ${prenom || ""}`);
      const inverse = cleNom(`${prenom || ""} ${nom || ""}`);
      return cherche === direct || cherche === inverse;
    };

    // On cherche d'abord parmi les eleves de classe : quand l'eleve y est, la dispense se rattache
    // a sa classe et apparait sur la carte Dispenses de celle-ci, comme une dispense ordinaire.
    const candidats = (eleves || []).filter(e =>
      memeNom(e.last_name, e.first_name)
      && (!classeVoulue || cleNom(nomClasse(e.class_id)) === classeVoulue));

    // A defaut, l'eleve du repertoire : il a une division - sa vraie classe - mais aucun
    // professeur ne l'a encore versee dans la sienne. La dispense est posee quand meme.
    const duRepertoire = candidats.length ? [] : repertoire.filter(e =>
      memeNom(e.last_name, e.first_name)
      && (!classeVoulue || cleNom(String(e.division || "")) === classeVoulue));

    const trouves = candidats.length ? candidats.length : duRepertoire.length;
    if (!trouves) return repondre({ error: `Élève introuvable : « ${ligne.eleve || ""} »` }, 404);
    if (trouves > 1) {
      return repondre({ error: "Plusieurs élèves portent ce nom : précisez la classe" }, 409);
    }
    const eleve = candidats.length ? candidats[0] : null;
    const fiche = eleve ? null : duRepertoire[0];

    const maintenant = new Date().toISOString();
    const corps = {
      // La dispense revient au professeur de l'eleve, pas au compte de la passerelle : c'est chez
      // lui qu'elle doit apparaitre dans "Mes dispenses", et lui seul peut la corriger depuis
      // l'application. Un eleve du repertoire n'a pas encore de professeur : elle revient alors
      // au compte de reference.
      user_id: eleve?.user_id || SHEET_USER_ID,
      class_id: eleve ? eleve.class_id : null,
      student_id: eleve ? eleve.id : null,
      unss_student_id: fiche ? fiche.id : null,
      // Le nom et la division sont recopies : ils font tenir la ligne debout tant qu'aucune
      // classe ne la porte, et l'affichage les utilise deja en repli (voir schema_sante_3).
      student_last_name: (eleve || fiche)?.last_name || null,
      student_first_name: (eleve || fiche)?.first_name || null,
      class_name: eleve ? nomClasse(eleve.class_id) : (String(fiche?.division || "") || null),
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
        .update(corps).eq("id", id);
      if (error) return repondre({ error: error.message }, 500);
      return repondre({ id, statut: "corrigée" });
    }
    // La provenance ne se pose qu'a la creation : corriger une dispense du professeur ne doit pas
    // la faire passer pour une saisie de l'infirmerie.
    const { data, error } = await admin.from("health_dispensations")
      .insert({ ...corps, entered_by: "INFIRMERIE", created_at: maintenant })
      .select("id").single();
    if (error) return repondre({ error: error.message }, 500);
    return repondre({ id: data.id, statut: "ajoutée" });
  }

  // ---- Supprimer : une ligne retiree du Sheet efface la dispense -------------------------------
  if (action === "supprimer") {
    const id = String(requete.id || "").trim();
    if (!id) return repondre({ error: "Identifiant manquant" }, 400);
    // L'effacement laisse une trace au lieu de retirer la ligne : une suppression reelle
    // reviendrait a la synchronisation suivante, la copie locale du site la reproposant.
    const { error } = await admin.from("health_dispensations")
      .update({ deleted: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return repondre({ error: error.message }, 500);
    return repondre({ statut: "supprimée" });
  }

  return repondre({ error: "Action inconnue" }, 400);
});
