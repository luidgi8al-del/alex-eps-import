import { listConflicts } from "../sync/conflicts.js";
import { resolveConflict, buildFieldChoice, acknowledgeRejection, retryRejection, retryAllRejections, resolveAllConflicts } from "../sync/resolve.js";

/**
 * L'ecran de resolution des conflits.
 *
 * Un conflit n'est pas une erreur technique a faire disparaitre : c'est une question posee au
 * professeur, qui seul sait laquelle des deux versions est juste. L'ecran montre donc les deux
 * cote a cote, champ par champ, plutot que de trancher a sa place.
 *
 * Pas de case cochee d'avance qui filerait tout en silence : mais quand plusieurs fiches
 * s'accumulent pour la meme raison (un appareil qui n'avait pas synchronise depuis un moment),
 * les boutons "pour toutes" en haut appliquent un seul choix explicite a chacune, plutot que de
 * faire rejouer le meme geste une fois par fiche.
 */
const LIBELLES_DEFAUT = {
  classes: "Classe", class_schedule_slots: "Créneau de la classe", period_activities: "Programmation",
  cycles: "Cycle", evaluations: "Évaluation", evaluation_criteria: "Critère d’évaluation",
  students: "Fiche de l’élève", evaluation_scores: "Résultat d’évaluation",
  unss_students: "Fiche AS de l’élève", unss_groups: "Groupe AS", unss_slots: "Créneau AS",
  unss_memberships: "Inscription AS", unss_sessions: "Appel AS", unss_attendance: "Présence AS",
  eps_test_sessions: "Test EPS", eps_test_results: "Résultat de test EPS",
  health_dispensations: "Dispense", health_accidents: "Accident",
  equipment: "Matériel", epi_items: "EPI", epi_inspections: "Contrôle EPI",
  sport_installations: "Installation sportive", installation_conflict_overrides: "Occupation d’installation",
  official_programs: "Programme officiel", annual_plan_blocks: "Programmation annuelle",
  institution_calendar_events: "Événement du calendrier", eps_period_dates: "Dates de période",
  nom: "Nom", first_name: "Prénom", last_name: "Nom", division: "Classe", school_class_label: "Classe",
  class_label: "Classe", sex: "Sexe", student_email: "Adresse e-mail de l’élève",
  parent_email: "Adresse e-mail des parents", parent_phone: "Téléphone des parents",
  birth_date_epoch_millis: "Date de naissance", category: "Catégorie", licensed: "Licence AS",
  jersey_size: "Taille du maillot", wish1: "Vœu 1", wish2: "Vœu 2", wish3: "Vœu 3",
  wish1_slot_id: "Créneau du vœu 1", wish2_slot_id: "Créneau du vœu 2", wish3_slot_id: "Créneau du vœu 3",
  host_available: "Peut héberger", host_capacity: "Nombre de places proposées",
  host_age_min: "Âge minimum pour l’hébergement", host_age_max: "Âge maximum pour l’hébergement",
  host_sex_pref: "Préférence d’hébergement", payment_missing: "Paiement manquant",
  medical_certificate_missing: "Certificat médical manquant", present: "Présence",
  label: "Intitulé", name: "Nom", activity_name: "Activité", responsible_teacher: "Professeur responsable",
  start_time: "Heure de début", end_time: "Heure de fin", location: "Lieu", date_epoch_millis: "Date",
  HOST_AVAILABLE: "Peut héberger", HOST_CAPACITY: "Nombre de places proposées",
  HOST_AGE_MIN: "Âge minimum pour l’hébergement", HOST_AGE_MAX: "Âge maximum pour l’hébergement",
  HOST_SEX_PREF: "Préférence d’hébergement",
  __deleted__: "Suppression de la fiche"
};

function texte(valeur) {
  if (valeur === undefined || valeur === null || valeur === "") return "(vide)";
  if (valeur === true) return "Oui";
  if (valeur === false) return "Non";
  if (Array.isArray(valeur)) return valeur.length ? valeur.join(", ") : "(vide)";
  return typeof valeur === "object" ? JSON.stringify(valeur) : String(valeur);
}

function echapper(valeur) {
  return String(valeur).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function dateLisible(valeur) {
  if (!valeur) return "";
  const d = new Date(valeur);
  return isNaN(d) ? "" : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function motsLisibles(valeur) {
  const texte = String(valeur || "").replaceAll("_", " ").trim().toLocaleLowerCase("fr-FR");
  return texte ? texte.charAt(0).toLocaleUpperCase("fr-FR") + texte.slice(1) : "Information";
}

function libelleChamp(champ, libelles) { return libelles[champ] || motsLisibles(champ); }

function identite(conflit) {
  const donnees = conflit.localData || conflit.serverData || {};
  const nom = String(donnees.last_name || donnees.nom || "").trim().toLocaleUpperCase("fr-FR");
  const prenomBrut = String(donnees.first_name || donnees.prenom || "").trim().toLocaleLowerCase("fr-FR");
  const prenom = prenomBrut.replace(/(^|[\s'’\-])([a-zà-öø-ÿ])/g,
    (_match, separateur, lettre) => `${separateur}${lettre.toLocaleUpperCase("fr-FR")}`);
  return `${nom} ${prenom}`.trim();
}

function titreFiche(conflit, libelles) {
  const personne = identite(conflit);
  if (personne && ["students", "unss_students"].includes(conflit.entity)) return `Fiche de ${personne}`;
  const donnees = conflit.localData || conflit.serverData || {};
  const precision = donnees.label || donnees.name || donnees.activity_name || donnees.title || "";
  const type = libelles[conflit.entity] || motsLisibles(conflit.entity);
  return precision ? `${type} · ${precision}` : type;
}

/**
 * Un refus n'offre aucun choix : le serveur n'acceptera pas cette saisie de ce compte. On dit ce
 * qui a ete tente, pourquoi c'est refuse, et on laisse un seul geste possible.
 */
/**
 * Un refus de droits se dit autrement qu'un refus du serveur.
 *
 * Le message annoncait "reserve a l'administrateur" quel que soit le motif : un HTTP 400 du a
 * une valeur invalide se lisait donc comme un probleme de droits, et envoyait chercher au
 * mauvais endroit.
 */
function estRefusDeDroits(raison) {
  return /administrateur|droits|403|Reserv/i.test(String(raison || ""));
}

function refusHtml(refus, libelles) {
  const champs = (refus.overlappingFields || [])
    .filter(champ => champ !== "__deleted__")
    .map(champ => `${echapper(libelleChamp(champ, libelles))} : ${echapper(texte(refus.localData?.[champ]))}`);
  const geste = (refus.overlappingFields || []).includes("__deleted__") ? "Suppression" : "Modification";
  const explication = refus.entity === "unss_attendance"
    ? "Cette présence dépend de l’appel refusé. Relancez toutes les saisies pour envoyer d’abord l’appel, puis ses présences."
    : estRefusDeDroits(refus.reason)
      ? "Le serveur a refusé cette action avec les droits actuels."
      : "Le serveur a refusé cette saisie.";
  return `
    <section class="conflit conflitRefus" data-refus="${echapper(refus.conflictId)}">
      <h3>${echapper(titreFiche(refus, libelles))}</h3>
      <p class="conflitQuand">${geste} refusée — ${echapper(refus.reason || "raison inconnue")}.
         ${explication}
         Elle ne sera pas enregistrée.</p>
      ${champs.length ? `<ul class="conflitChamps">${champs.map(c => `<li>${c}</li>`).join("")}</ul>` : ""}
      <div class="conflitActions">
        <button type="button" data-refus-retry="${echapper(refus.conflictId)}">Réessayer</button>
        <button type="button" data-refus-ok="${echapper(refus.conflictId)}">J'ai compris</button>
      </div>
    </section>`;
}

function conflitHtml(conflit, libelles) {
  const titre = titreFiche(conflit, libelles);
  const heureServeur = dateLisible(conflit.serverModifiedAt);
  const lignes = conflit.overlappingFields.map(champ => `
    <tr data-champ="${echapper(champ)}">
      <th>${echapper(libelleChamp(champ, libelles))}</th>
      <td><label><input type="radio" name="c-${echapper(conflit.conflictId)}-${echapper(champ)}" value="local" checked>
        ${echapper(texte(conflit.localData?.[champ]))}</label></td>
      <td><label><input type="radio" name="c-${echapper(conflit.conflictId)}-${echapper(champ)}" value="server">
        ${echapper(texte(conflit.serverData?.[champ]))}</label></td>
    </tr>`).join("");

  return `
    <section class="conflit" data-conflit="${echapper(conflit.conflictId)}">
      <h3>${echapper(titre)}</h3>
      <p class="conflitExplication">Cette fiche a été modifiée sur deux appareils. Pour chaque information,
         choisissez celle qui doit être conservée.</p>
      <p class="conflitQuand">Votre saisie : ${echapper(dateLisible(conflit.localModifiedAt))}
         · version enregistrée : ${echapper(heureServeur)}</p>
      <table class="conflitTable">
        <thead><tr><th>Information</th><th>Ma saisie</th><th>Version enregistrée${heureServeur ? ` à ${echapper(heureServeur)}` : ""}</th></tr></thead>
        <tbody>${lignes}</tbody>
      </table>
      <div class="conflitActions">
        <button type="button" data-choix="local">Garder ma version</button>
        <button type="button" data-choix="server">Garder la version enregistree</button>
        <button type="button" data-choix="merged">Appliquer mes choix ci-dessus</button>
      </div>
    </section>`;
}

/**
 * Affiche les conflits dans l'element donne et branche les boutons.
 * Renvoie une fonction de rafraichissement, a rappeler apres une synchronisation.
 */
export function mountConflictDialog(element, { labels = {}, onResolved } = {}) {
  if (!element) throw new TypeError("Element d'accueil des conflits absent");
  const libelles = { ...LIBELLES_DEFAUT, ...labels };

  async function afficher() {
    const conflits = await listConflicts();
    if (conflits.length === 0) {
      element.innerHTML = `<p class="conflitAucun">Aucun conflit a traiter.</p>`;
      return conflits.length;
    }
    const refuses = conflits.filter(c => c.kind === "refus");
    const arbitrer = conflits.filter(c => c.kind !== "refus");
    element.innerHTML =
      (refuses.length ? `<p class="conflitIntro">${refuses.length} saisie(s) refusée(s) par le serveur.</p>
        <div class="conflitActions"><button type="button" data-refus-retry-all>Réessayer toutes les saisies</button></div>`
        + refuses.map(r => refusHtml(r, libelles)).join("") : "")
      + (arbitrer.length ? `<p class="conflitIntro"><strong>${arbitrer.length} ${arbitrer.length > 1 ? "fiches ont" : "fiche a"} été modifiée${arbitrer.length > 1 ? "s" : ""} sur deux appareils.</strong><br>
        Rien ne sera envoyé avant votre décision.</p>`
        + (arbitrer.length > 1 ? `<div class="conflitActions">
            <button type="button" data-tout-choix="local">Garder ma version pour les ${arbitrer.length} fiches</button>
            <button type="button" data-tout-choix="server">Garder la version enregistree pour les ${arbitrer.length} fiches</button>
          </div>` : "")
        + arbitrer.map(c => conflitHtml(c, libelles)).join("") : "");

    element.querySelectorAll("[data-refus-ok]").forEach(bouton => {
      bouton.addEventListener("click", async () => {
        bouton.disabled = true;
        try { await acknowledgeRejection(bouton.dataset.refusOk); }
        catch (error) {
          bouton.disabled = false;
          bouton.insertAdjacentHTML("afterend", `<p class="conflitErreur">${echapper(error.message)}</p>`);
          return;
        }
        onResolved?.({ conflictId: bouton.dataset.refusOk }, "refus");
        await afficher();
      });
    });
    element.querySelectorAll("[data-refus-retry]").forEach(bouton => {
      bouton.addEventListener("click", async () => {
        bouton.disabled = true;
        try { await retryRejection(bouton.dataset.refusRetry); }
        catch (error) {
          bouton.disabled = false;
          bouton.insertAdjacentHTML("afterend", `<p class="conflitErreur">${echapper(error.message)}</p>`);
          return;
        }
        onResolved?.({ conflictId: bouton.dataset.refusRetry }, "retry");
        await afficher();
      });
    });
    element.querySelector("[data-refus-retry-all]")?.addEventListener("click", async event => {
      const bouton = event.currentTarget;
      bouton.disabled = true;
      try { await retryAllRejections(); }
      catch (error) {
        bouton.disabled = false;
        bouton.insertAdjacentHTML("afterend", `<p class="conflitErreur">${echapper(error.message)}</p>`);
        return;
      }
      onResolved?.({}, "retry-all");
      await afficher();
    });

    element.querySelectorAll("[data-tout-choix]").forEach(bouton => {
      bouton.addEventListener("click", async () => {
        element.querySelectorAll("[data-tout-choix], [data-conflit] button").forEach(b => { b.disabled = true; });
        try { await resolveAllConflicts(bouton.dataset.toutChoix); }
        catch (error) {
          element.querySelectorAll("[data-tout-choix], [data-conflit] button").forEach(b => { b.disabled = false; });
          bouton.insertAdjacentHTML("afterend", `<p class="conflitErreur">${echapper(error.message)}</p>`);
          return;
        }
        onResolved?.({}, `${bouton.dataset.toutChoix}-all`);
        await afficher();
      });
    });

    element.querySelectorAll("[data-conflit]").forEach(bloc => {
      const conflit = conflits.find(c => c.conflictId === bloc.dataset.conflit);
      bloc.querySelectorAll("[data-choix]").forEach(bouton => {
        bouton.addEventListener("click", async () => {
          bloc.querySelectorAll("button").forEach(b => { b.disabled = true; });
          try {
            const choix = bouton.dataset.choix;
            const donnees = choix === "merged" ? buildFieldChoice(conflit, choixParChamp(bloc)) : undefined;
            await resolveConflict(conflit.conflictId, choix, donnees);
            onResolved?.(conflit, choix);
          } catch (error) {
            // Le conflit reste affiche : mieux vaut une decision a reprendre qu'une disparition.
            bloc.querySelectorAll("button").forEach(b => { b.disabled = false; });
            bloc.insertAdjacentHTML("beforeend", `<p class="conflitErreur">${echapper(error.message)}</p>`);
            return;
          }
          await afficher();
        });
      });
    });
    return conflits.length;
  }

  function choixParChamp(bloc) {
    const choix = {};
    bloc.querySelectorAll("[data-champ]").forEach(ligne => {
      const coche = ligne.querySelector("input:checked");
      if (coche) choix[ligne.dataset.champ] = coche.value;
    });
    return choix;
  }

  afficher();
  return afficher;
}
