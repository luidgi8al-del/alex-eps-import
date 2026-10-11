/* Présentation seulement : les écrans, saisies et droits restent ceux de la classe. */
(function () {
  const choices = ["ACTUEL", "CLAIR", "EVALUATIONS"];
  function classVisual() {
    const value = loadPrefs().classVisual;
    return choices.includes(value) ? value : "ACTUEL";
  }
  function appliquerVisuelClasse(panel) {
    const visual = classVisual();
    panel.classList.toggle("ec-visuel-clair", visual !== "ACTUEL");
    if (visual === "ACTUEL") return;
    const screen = panel.querySelector(".ec-ecran");
    if (!screen) return;
    const nav = document.createElement("nav");
    nav.className = "ec-visuel-navigation";
    nav.setAttribute("aria-label", "Rubriques de la classe");
    nav.innerHTML = [["bord","Vue d’ensemble"],["eleves","Élèves"],["evaluations","Évaluations"],["groupes","Groupes"],["documents","Documents"],["dispenses","Dispenses"],["suivi","Suivi de classe"],["recap","Récapitulatif"]]
      .map(([value,label])=>`<button type="button" data-class-view="${value}" aria-current="${vueClasse===value?'page':'false'}">${label}</button>`).join("");
    nav.querySelectorAll("button").forEach(b=>b.onclick=()=>ecAller(b.dataset.classView));
    screen.querySelector(".ec-bandeau")?.after(nav);
    if (vueClasse !== "bord") return;
    const body = screen.querySelector(".ec-corps");
    const start = body.querySelector("#ecPreparerSeance");
    if (start) {
      const top = document.createElement("div"); top.className="ec-visuel-seance";
      top.append(start); body.prepend(top);
    }
    const summary = body.querySelector(".ec-resume");
    const course = body.querySelector(".ec-prochain-cours");
    const actions = body.querySelector(".ec-actions-rapides");
    const main = body.querySelector(".ec-tableau-principal");
    const {evaluations,tests} = ecEvaluationsSuivies();
    const size = dashboardStudents.length;
    const cards = evaluations.map(e=>({title:e.label||"Évaluation",kind:"Évaluation",count:ecAvancementGrille(e.id).evalues,
      ready:ecNotesChargees,date:Number(e.date_epoch_millis)||0,open:()=>{if(e.cycle)ouvrirTableauDeNotes(e.cycle,e.type,e.id);else ecAller("evaluations");}}))
      .concat(tests.map(t=>({title:t.test_name||"Test EPS",kind:"Test EPS",count:new Set(ecResultatsTests.filter(r=>r.session_id===t.id&&EpsStudentResults.complete(r)).map(r=>r.student_id)).size,
        ready:true,date:Number(t.created_at)||Date.parse(t.created_at)||0,open:()=>ecOuvrirTestEnFenetre(t)})))
      .filter(c=>!c.ready||!size||c.count<size).sort((a,b)=>b.date-a.date);
    const ongoing=document.createElement("section");ongoing.className="ec-carte ec-visuel-reprendre";
    ongoing.innerHTML=`<div class="ec-carte-tete"><h3>Évaluations à reprendre</h3><button type="button" class="secondary" data-all>Tout voir</button></div>`;
    ongoing.querySelector("[data-all]").onclick=()=>{ecFiltreEvaluations=visual==='EVALUATIONS'?'Toutes':'À reprendre';ecAller("evaluations");};
    if(!cards.length)ongoing.insertAdjacentHTML("beforeend",'<p class="ec-vide">Aucune saisie à reprendre pour cette période.</p>');
    cards.slice(0,visual==='EVALUATIONS'?5:2).forEach(c=>{
      const button=document.createElement("button");button.type="button";button.className="ec-visuel-evaluation";
      button.innerHTML=`<span><small>${ecTexte(c.kind)}</small><b>${ecTexte(c.title)}</b><small>${c.ready?`${c.count} / ${size} élèves évalués`:'Chargement des résultats…'}</small>${ecJauge(c.ready&&size?c.count/size:0,"#2E7CC4")}</span><strong>Reprendre →</strong>`;
      button.onclick=c.open;ongoing.append(button);
    });
    const left=document.createElement("div");left.className="ec-visuel-colonne";left.append(ongoing);
    const groups=document.createElement("section");groups.className="ec-carte";
    const compositions=ecEquipes.filter(e=>!e.deleted);
    groups.innerHTML=`<div class="ec-carte-tete"><h3>Groupes enregistrés</h3><small>${compositions.length} composition${compositions.length>1?'s':''}</small></div><p class="ec-vide">${compositions.length?'Retrouver les équipes de la classe et les réutiliser dans les outils.':'Aucune composition conservée pour cette classe.'}</p><button type="button" class="secondary">Ouvrir les groupes</button>`;
    groups.querySelector("button").onclick=()=>ecAller("groupes");left.append(groups);
    const right=document.createElement("div");right.className="ec-visuel-colonne";if(summary)right.append(summary);if(course)right.append(course);
    const finish=actions?.querySelector("#ecTerminerSeance");if(finish){const box=document.createElement("section");box.className="ec-carte ec-actions-rapides";box.append(finish);right.append(box);}
    if(main)main.replaceChildren(left,right);
  }
  globalThis.classVisual = classVisual;
  globalThis.appliquerVisuelClasse = appliquerVisuelClasse;
})();
