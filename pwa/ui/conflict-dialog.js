import { listConflicts } from "../sync/conflicts.js";
import { resolveConflict, buildFieldChoice, acknowledgeRejection } from "../sync/resolve.js";

/**
 * L'ecran de resolution des conflits.
 *
 * Un conflit n'est pas une erreur technique a faire disparaitre : c'est une question posee au
 * professeur, qui seul sait laquelle des deux versions est juste. L'ecran montre donc les deux
 * cote a cote, champ par champ, plutot que de trancher a sa place.
 *
 * Il n'y a pas de bouton "tout ignorer" : chaque conflit se decide, sinon une saisie disparait en
 * silence - ce que ce module existe justement pour empecher.
 */
const LIBELLES_DEFAUT = {
  nom: "Nom", first_name: "Prenom", last_name: "Nom", division: "Division",
  sex: "Sexe", student_email: "Mail eleve", parent_email: "Mail parent",
  __deleted__: "Suppression de la fiche"
};

function texte(valeur) {
  if (valeur === undefined || valeur === null || valeur === "") return "(vide)";
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

/**
 * Un refus n'offre aucun choix : le serveur n'acceptera pas cette saisie de ce compte. On dit ce
 * qui a ete tente, pourquoi c'est refuse, et on laisse un seul geste possible.
 */
function refusHtml(refus, libelles) {
  const champs = (refus.overlappingFields || [])
    .filter(champ => champ !== "__deleted__")
    .map(champ => `${echapper(libelles[champ] || champ)} : ${echapper(texte(refus.localData?.[champ]))}`);
  const geste = (refus.overlappingFields || []).includes("__deleted__") ? "Suppression" : "Modification";
  return `
    <section class="conflit conflitRefus" data-refus="${echapper(refus.conflictId)}">
      <h3>${echapper(libelles[refus.entity] || refus.entity)} · ${echapper(refus.id)}</h3>
      <p class="conflitQuand">${geste} refusée — ${echapper(refus.reason || "droits insuffisants")}.
         Cette action est réservée à l'administrateur : votre saisie ne sera pas enregistrée.</p>
      ${champs.length ? `<ul class="conflitChamps">${champs.map(c => `<li>${c}</li>`).join("")}</ul>` : ""}
      <div class="conflitActions">
        <button type="button" data-refus-ok="${echapper(refus.conflictId)}">J'ai compris</button>
      </div>
    </section>`;
}

function conflitHtml(conflit, libelles) {
  const lignes = conflit.overlappingFields.map(champ => `
    <tr data-champ="${echapper(champ)}">
      <th>${echapper(libelles[champ] || champ)}</th>
      <td><label><input type="radio" name="c-${echapper(conflit.conflictId)}-${echapper(champ)}" value="local" checked>
        ${echapper(texte(conflit.localData?.[champ]))}</label></td>
      <td><label><input type="radio" name="c-${echapper(conflit.conflictId)}-${echapper(champ)}" value="server">
        ${echapper(texte(conflit.serverData?.[champ]))}</label></td>
    </tr>`).join("");

  return `
    <section class="conflit" data-conflit="${echapper(conflit.conflictId)}">
      <h3>${echapper(libelles[conflit.entity] || conflit.entity)} · ${echapper(conflit.id)}</h3>
      <p class="conflitQuand">Votre version : ${echapper(dateLisible(conflit.localModifiedAt))}
         — celle du serveur : ${echapper(dateLisible(conflit.serverModifiedAt))}</p>
      <table class="conflitTable">
        <thead><tr><th></th><th>Ma version</th><th>Version enregistree</th></tr></thead>
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
      (refuses.length ? `<p class="conflitIntro">${refuses.length} saisie(s) refusée(s) par le serveur.</p>`
        + refuses.map(r => refusHtml(r, libelles)).join("") : "")
      + (arbitrer.length ? `<p class="conflitIntro">${arbitrer.length} fiche(s) modifiee(s) des deux cotes.
        Choisissez la version a conserver : rien ne sera envoye avant votre decision.</p>`
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
