/**
 * Petit banc d'essai maison, execute dans le navigateur.
 *
 * Le moteur ne peut pas etre teste sous Node : il repose sur IndexedDB et sur crypto.subtle, qui
 * n'existent que dans un navigateur. Un banc de vingt lignes evite d'installer tout un outillage
 * pour verifier quelques dizaines de cas.
 */
const cas = [];

export function test(nom, execution) { cas.push({ nom, execution }); }

export function assert(condition, message) {
  if (!condition) throw new Error(message || "Condition attendue vraie");
}

export function assertEgal(obtenu, attendu, message) {
  const a = JSON.stringify(obtenu), b = JSON.stringify(attendu);
  if (a !== b) throw new Error(`${message || "Valeurs differentes"}\n  attendu : ${b}\n  obtenu  : ${a}`);
}

export async function assertRejette(action, message) {
  try { await action(); } catch { return; }
  throw new Error(message || "Une erreur etait attendue");
}

/** Lance tous les cas et renvoie un bilan lisible aussi bien a l'ecran qu'en console. */
export async function lancer({ avantChaque } = {}) {
  const echecs = [];
  for (const { nom, execution } of cas) {
    try {
      await avantChaque?.();
      await execution();
    } catch (error) {
      echecs.push({ nom, message: error.message });
    }
  }
  return { total: cas.length, echecs, reussis: cas.length - echecs.length };
}
