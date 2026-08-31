const EXTRA_SCHOOL_LEVELS = {
  PREMIERE_EPPCS:"Première EPPCS", TERMINALE_EPPCS:"Terminale EPPCS",
  OPTION_GOLF:"Option Golf", SECONDE_SPORT_SANTE:"Seconde Sport et Santé"
};
function baseSchoolLevel(grade) {
  return ({PREMIERE_EPPCS:"PREMIERE",TERMINALE_EPPCS:"TERMINALE",SECONDE_SPORT_SANTE:"SECONDE"})[grade] || grade;
}
function isTerminalSchoolLevel(grade) { return baseSchoolLevel(grade) === "TERMINALE"; }
function periodCountForLevel(grade, prefs) {
  const base=baseSchoolLevel(grade), old=prefs.periods||{};
  const fallback=base==="TERMINALE" ? (old.terminale??3) : base==="PREMIERE" ? (old.premiere??4) : (old.college??4);
  const value=Number(prefs.periodCounts?.[grade] ?? prefs.periodCounts?.[base] ?? fallback);
  return [3,4,5].includes(value) ? value : (base==="TERMINALE"?3:4);
}
for (const select of document.querySelectorAll('select')) {
  if (select.querySelector('option[value="TERMINALE"]')) {
    for(const [value,label] of Object.entries(EXTRA_SCHOOL_LEVELS)) select.add(new Option(label,value));
  }
}
