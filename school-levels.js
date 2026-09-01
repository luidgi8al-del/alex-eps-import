// Module isole : le code vit dans une fonction, pas dans la portee globale.
// Deux fichiers peuvent donc declarer le meme nom sans SyntaxError qui tue la page.
// Les noms ci-dessous restent volontairement globaux : l'inline script d'index.html
// et les attributs onclick du HTML les appellent par leur nom nu.
(function () {
  const EXTRA_SCHOOL_LEVELS = {
    PREMIERE_EPPCS:"Première EPPCS", TERMINALE_EPPCS:"Terminale EPPCS",
    OPTION_GOLF:"Option Golf", SECONDE_SPORT_SANTE:"Seconde Sport et Santé"
  };
  function baseSchoolLevel(grade) {
    return ({PREMIERE_EPPCS:"PREMIERE",TERMINALE_EPPCS:"TERMINALE",SECONDE_SPORT_SANTE:"SECONDE"})[grade] || grade;
  }
  function isTerminalSchoolLevel(grade) { return baseSchoolLevel(grade) === "TERMINALE"; }
  // periodCountForLevel vit dans period-settings.js, qui lit les periodes partagees entre
  // appareils. Une seconde version ici la masquait selon l'ordre de chargement des scripts.
  for (const select of document.querySelectorAll('select')) {
    if (select.querySelector('option[value="TERMINALE"]')) {
      for(const [value,label] of Object.entries(EXTRA_SCHOOL_LEVELS)) select.add(new Option(label,value));
    }
  }

  // Surface publique du module.
  globalThis.EXTRA_SCHOOL_LEVELS = EXTRA_SCHOOL_LEVELS;
  globalThis.baseSchoolLevel = baseSchoolLevel;
  globalThis.isTerminalSchoolLevel = isTerminalSchoolLevel;
})();
