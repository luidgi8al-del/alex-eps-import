/**
 * Script a coller dans le Google Sheet partage avec l'infirmerie.
 * (Sheet > Extensions > Apps Script, remplacer tout le contenu, puis Enregistrer.)
 *
 * Ce que fait ce script :
 *   - toutes les 5 minutes, il relit les dispenses de la base et reecrit le tableau ;
 *   - des qu'une ligne est saisie ou corrigee dans le Sheet, il l'envoie dans la base ;
 *   - la colonne Eleve est une liste deroulante : on tape quelques lettres du nom OU du prenom,
 *     on choisit, et la classe et la date de naissance se remplissent toutes seules ;
 *   - un menu "Dispenses EPS" permet d'actualiser tout de suite, ou de supprimer une ligne.
 *
 * Avant la premiere utilisation, poser les deux reglages dans
 * Apps Script > Parametres du projet > Proprietes du script :
 *   URL_PASSERELLE  https://<votre-projet>.supabase.co/functions/v1/eps-dispenses-sheet
 *   SECRET          le meme mot de passe que le secret EPS_SHEET_SECRET cote Supabase
 *
 * Le secret n'est volontairement pas ecrit dans ce fichier : il resterait visible dans
 * l'historique du script, et lisible par toute personne pouvant ouvrir l'editeur.
 */

/** L'ordre des colonnes. Le tableau est reecrit a chaque actualisation : ne pas en intercaler. */
var COLONNES = ['id', 'Élève', 'Classe', 'Naissance', 'Début', 'Fin', 'Famille', 'Motif',
                'Aptitude', 'Sport adapté', 'État', 'Fait par'];
var COL_ID = 1, COL_ELEVE = 2, COL_CLASSE = 3, COL_NAISSANCE = 4, COL_DEBUT = 5, COL_FIN = 6,
    COL_FAMILLE = 7, COL_MOTIF = 8, COL_APTITUDE = 9, COL_ADAPTE = 10, COL_ETAT = 11,
    COL_AUTEUR = 12;
var PREMIERE_LIGNE = 2;

/** L'onglet masque qui porte la liste des eleves, et jusqu'ou la liste deroulante s'applique. */
var ONGLET_ELEVES = 'Élèves';
var DERNIERE_LIGNE_LISTE = 1000;
/**
 * Les dispenses terminees vont dans leur propre onglet.
 *
 * La saisie reste sur le premier onglet, et lui seul : une dispense passee se corrige depuis
 * l'application ou le site, pas ici. C'est aussi ce qui garde l'onglet de travail court - on y
 * voit ce qui est en cours, pas l'annee entiere.
 */
var ONGLET_EN_COURS = 'En cours';
var ONGLET_PASSEES = 'Passées';
/** Ce qui separe le nom de la classe dans un libelle : absent des noms d'eleves. */
var SEPARATEUR = ' — ';

function reglage_(nom) {
  var v = PropertiesService.getScriptProperties().getProperty(nom);
  if (!v) throw new Error('Réglage manquant : ' + nom + ' (Paramètres du projet > Propriétés du script)');
  return v;
}

/** Un appel a la passerelle. Le secret voyage dans le corps, jamais dans l'URL. */
function appeler_(charge) {
  charge.secret = reglage_('SECRET');
  var reponse = UrlFetchApp.fetch(reglage_('URL_PASSERELLE'), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(charge),
    muteHttpExceptions: true
  });
  var corps = {};
  try { corps = JSON.parse(reponse.getContentText()); } catch (e) { corps = {}; }
  if (reponse.getResponseCode() >= 300) {
    throw new Error(corps.error || ('Erreur ' + reponse.getResponseCode()));
  }
  return corps;
}

function classeur_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function feuille_() { return classeur_().getSheets()[0]; }

/**
 * L'onglet des eleves, cree au besoin.
 *
 * Il est ajoute en dernier et masque : feuille_() designe le premier onglet, et cet onglet-ci
 * ne doit jamais prendre sa place.
 */
function feuilleEleves_() {
  var classeur = classeur_();
  var feuille = classeur.getSheetByName(ONGLET_ELEVES);
  if (!feuille) {
    feuille = classeur.insertSheet(ONGLET_ELEVES, classeur.getSheets().length);
    feuille.hideSheet();
  }
  return feuille;
}

/**
 * L'onglet des dispenses terminees, cree au besoin, juste apres celui de saisie.
 *
 * Il est place en deuxieme et jamais en premier : feuille_() designe le premier onglet, et c'est
 * lui qui recoit la saisie.
 */
function feuillePassees_() {
  var classeur = classeur_();
  var feuille = classeur.getSheetByName(ONGLET_PASSEES);
  if (!feuille) feuille = classeur.insertSheet(ONGLET_PASSEES, 1);
  return feuille;
}

/** La date du jour, dans le fuseau du classeur. */
function aujourdHui_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Une date de cellule (objet Date ou texte) ramenee au format attendu par la base. */
function dateTexte_(valeur) {
  if (valeur instanceof Date) {
    return Utilities.formatDate(valeur, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(valeur || '').trim().slice(0, 10);
}

/**
 * Verification de la mise en place, a lancer une fois depuis l'editeur (bouton Executer).
 *
 * Elle dit dans le journal ce qui va et ce qui manque, au lieu de laisser deviner : un script
 * non rattache a un Sheet, un reglage oublie ou un secret qui ne correspond pas donnent tous
 * trois la meme impression a l'usage - "rien ne se passe".
 */
function verifier() {
  var lignes = [];

  // Un script attache au Sheet voit sa feuille ; un script independant n'en a aucune, et rien
  // de ce qui suit ne pourrait fonctionner.
  var classeur = null;
  try { classeur = classeur_(); } catch (e) { classeur = null; }
  if (classeur) {
    lignes.push('✓ Rattaché au Sheet : « ' + classeur.getName() + ' »');
  } else {
    lignes.push('✗ Ce script n’est rattaché à AUCUN Sheet.');
    lignes.push('  Ouvrez votre Google Sheet, puis Extensions > Apps Script, et recollez-y ce script.');
    Logger.log(lignes.join('\n'));
    return;
  }

  var manque = false;
  ['URL_PASSERELLE', 'SECRET'].forEach(function (nom) {
    var v = PropertiesService.getScriptProperties().getProperty(nom);
    if (v) {
      // On confirme la presence sans reafficher la valeur : le journal se relit et se partage.
      lignes.push('✓ Réglage ' + nom + ' : renseigné' +
        (nom === 'URL_PASSERELLE' ? ' (' + v + ')' : ''));
    } else {
      lignes.push('✗ Réglage ' + nom + ' : MANQUANT (Paramètres du projet > Propriétés du script)');
      manque = true;
    }
  });
  if (manque) { Logger.log(lignes.join('\n')); return; }

  try {
    var eleves = (appeler_({ action: 'eleves' }).lignes) || [];
    lignes.push('✓ Passerelle joignable, et le secret est accepté.');
    lignes.push('✓ ' + eleves.length + ' élève(s) trouvés pour la liste déroulante.');
    if (!eleves.length) {
      lignes.push('  Aucun élève : vérifiez EPS_SHEET_USER_ID côté Supabase.');
    }
    lignes.push('');
    lignes.push('Tout est en place. Lancez maintenant « actualiser » pour remplir le tableau.');
  } catch (erreur) {
    lignes.push('✗ Appel refusé : ' + erreur.message);
    if (String(erreur.message).indexOf('Secret') >= 0) {
      lignes.push('  Le SECRET ici et EPS_SHEET_SECRET côté Supabase ne sont pas identiques.');
    }
  }
  Logger.log(lignes.join('\n'));
}

/**
 * Releve de ce que contient reellement la base, quand la liste parait incomplete.
 *
 * A lancer depuis l'editeur et lire dans le journal. Il separe les deux causes possibles d'une
 * liste trop courte - un filtre trop strict, ou le plafond de lignes de PostgREST - qui donnent
 * a l'oeil exactement le meme resultat.
 */
function diagnostic() {
  var d = appeler_({ action: 'diagnostic' });
  var lignes = [
    'Élèves, toutes lignes confondues (supprimés compris) : ' + d.eleves_total_toutes_lignes,
    'Élèves non supprimés : ' + d.eleves_non_supprimes,
    'Élèves réellement rendus par la requête : ' + d.eleves_rendus_par_la_requete,
    'Classes non supprimées : ' + d.classes_non_supprimees,
    'Comptes enseignants concernés : ' + d.comptes,
    ''
  ];
  if (d.eleves_rendus_par_la_requete < d.eleves_non_supprimes) {
    lignes.push('→ La requête rend MOINS que ce que contient la table : c’est le plafond de');
    lignes.push('  lignes de PostgREST, pas un filtre. Il faut lire par tranches.');
  } else {
    lignes.push('→ La requête rend tout ce que la table contient de non supprimé.');
    lignes.push('  Les élèves manquants sont soit marqués supprimés, soit absents de la table.');
  }
  lignes.push('');
  lignes.push('Élèves dans les AUTRES tables (ils ne peuvent pas recevoir de dispense) :');
  Object.keys(d.ailleurs || {}).forEach(function (t) {
    lignes.push('  ' + t + ' : ' + d.ailleurs[t]);
  });
  lignes.push('');
  lignes.push('Répartition par compte :');
  Object.keys(d.eleves_par_compte || {}).forEach(function (c) {
    lignes.push('  ' + c + ' : ' + d.eleves_par_compte[c]);
  });
  Logger.log(lignes.join('\n'));
}

/** Le menu du Sheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Dispenses EPS')
    .addItem('Actualiser maintenant', 'actualiser')
    .addSeparator()
    .addItem('Supprimer la ligne sélectionnée', 'supprimerLigneSelectionnee')
    .addToUi();
}

/**
 * Recharge la liste des eleves et (re)pose la liste deroulante sur la colonne Eleve.
 *
 * La liste accepte aussi une saisie libre : un eleve arrive en cours d'annee et pas encore
 * synchronise doit pouvoir etre ecrit a la main, quitte a ce que la passerelle le refuse avec
 * un message clair - plutot qu'une cellule qui se bloque sans rien expliquer.
 */
function rafraichirListeEleves_() {
  var lignes = (appeler_({ action: 'eleves' }).lignes) || [];
  var feuille = feuilleEleves_();
  feuille.clear();
  // Meme precaution que pour le tableau : "6e1" ne doit pas devenir 60 dans la liste non plus,
  // sinon le libelle ecrit par l'actualisation ne correspondrait plus a celui de la liste.
  feuille.getRange(1, 1, Math.max(lignes.length + 1, 2), 4).setNumberFormat('@');
  feuille.getRange(1, 1, 1, 4).setValues([['libellé', 'nom', 'classe', 'naissance']]);
  if (lignes.length) {
    feuille.getRange(2, 1, lignes.length, 4).setValues(lignes.map(function (e) {
      return [e.libelle, e.nom, e.classe, e.naissance];
    }));
  }

  var principale = feuille_();
  var plageEleves = feuille.getRange(2, 1, Math.max(lignes.length, 1), 1);
  var regle = SpreadsheetApp.newDataValidation()
    .requireValueInRange(plageEleves, true)
    .setAllowInvalid(true)
    .setHelpText('Tapez quelques lettres du nom ou du prénom, puis choisissez dans la liste.')
    .build();
  principale.getRange(PREMIERE_LIGNE, COL_ELEVE, DERNIERE_LIGNE_LISTE - 1, 1)
    .setDataValidation(regle);
  return lignes.length;
}

/** Le libelle choisi dans la liste, ramene a ses trois informations. */
function eleveDepuisLibelle_(libelle) {
  var cherche = String(libelle || '').trim();
  if (!cherche) return null;
  var feuille = feuilleEleves_();
  var dernier = feuille.getLastRow();
  if (dernier < 2) return null;
  var valeurs = feuille.getRange(2, 1, dernier - 1, 4).getValues();
  for (var i = 0; i < valeurs.length; i++) {
    if (String(valeurs[i][0]).trim() === cherche) {
      return { nom: valeurs[i][1], classe: valeurs[i][2], naissance: valeurs[i][3] };
    }
  }
  return null;
}

/** Ecrit un jeu de dispenses dans un onglet, en-tetes comprises. Les deux onglets passent ici. */
function ecrireTableau_(feuille, lignes, couleurEntete) {
  feuille.getRange(1, 1, 1, COLONNES.length).setValues([COLONNES])
    .setFontWeight('bold').setBackground(couleurEntete).setFontColor('#ffffff');

  var dernier = feuille.getLastRow();
  if (dernier >= PREMIERE_LIGNE) {
    feuille.getRange(PREMIERE_LIGNE, 1, dernier - PREMIERE_LIGNE + 1, COLONNES.length).clearContent();
  }

  // Tout le tableau est du texte, pose AVANT l'ecriture.
  //
  // Une classe nommee "6e1" ou "3e2" est lue par Google comme de la notation scientifique :
  // elle s'affichait 6,00E+01 et 3,00E+02. Les dates subissent le meme sort selon la langue du
  // compte. Le format se declare avant setValues, sinon la conversion a deja eu lieu.
  feuille.getRange(PREMIERE_LIGNE, 1, DERNIERE_LIGNE_LISTE - 1, COLONNES.length)
    .setNumberFormat('@');

  if (lignes.length) {
    var valeurs = lignes.map(function (l) {
      return [l.id, l.eleve, l.classe, l.naissance, l.debut, l.fin,
              l.famille, l.motif, l.aptitude, l.adapte, '', l.auteur || ''];
    });
    feuille.getRange(PREMIERE_LIGNE, 1, valeurs.length, COLONNES.length).setValues(valeurs);
  }

  // La colonne des identifiants ne sert qu'a retrouver la ligne : elle n'a rien a dire a l'oeil.
  feuille.hideColumns(COL_ID);
  feuille.setFrozenRows(1);
}

/**
 * Reecrit les deux onglets avec l'etat de la base.
 *
 * Les tableaux sont reconstruits en entier : la base fait foi. Une saisie faite ici est deja
 * partie (voir auSurEdition) au moment ou elle est reecrite, elle n'est donc jamais perdue.
 *
 * Le partage en cours / passees se fait ici et non en base : une dispense passe de l'un a l'autre
 * toute seule le jour ou elle se termine, sans que personne ait rien a deplacer.
 */
function actualiser() {
  var reponse = appeler_({ action: 'lister' });
  var lignes = reponse.lignes || [];
  var jour = aujourdHui_();

  var enCours = [], passees = [];
  lignes.forEach(function (l) {
    if (String(l.fin || '') < jour) passees.push(l); else enCours.push(l);
  });

  var principale = feuille_();
  if (principale.getName() !== ONGLET_EN_COURS) principale.setName(ONGLET_EN_COURS);
  ecrireTableau_(principale, enCours, '#0876d1');
  ecrireTableau_(feuillePassees_(), passees, '#7a8a99');

  var nbEleves = rafraichirListeEleves_();
  classeur_().toast(enCours.length + ' en cours · ' + passees.length + ' passée(s) · '
                    + nbEleves + ' élèves dans la liste', 'Actualisé', 4);
}

/**
 * Une ligne saisie ou corrigee part aussitot dans la base.
 *
 * A installer comme declencheur "Sur modification" (Apps Script > Declencheurs) : le onEdit
 * simple n'a pas le droit d'appeler un service externe.
 */
function auSurEdition(e) {
  if (!e || !e.range) return;
  var feuille = e.range.getSheet();
  // Seul l'onglet de saisie envoie. Les deux autres sont reecrits a chaque actualisation : y
  // repondre ferait partir la reecriture elle-meme comme si c'etait une saisie.
  if (feuille.getSheetId() !== feuille_().getSheetId()) return;
  var ligne = e.range.getRow();
  if (ligne < PREMIERE_LIGNE) return;
  // Une modification de la colonne État est la notre : ne pas repartir en boucle.
  if (e.range.getColumn() === COL_ETAT || e.range.getColumn() === COL_AUTEUR) return;

  // Un eleve choisi dans la liste porte sa classe avec lui : on separe les deux et on complete
  // la naissance, pour que l'infirmerie n'ait plus que les dates et le motif a saisir.
  if (e.range.getColumn() === COL_ELEVE) {
    var trouve = eleveDepuisLibelle_(e.range.getValue());
    if (trouve) {
      feuille.getRange(ligne, COL_ELEVE).setValue(trouve.nom);
      feuille.getRange(ligne, COL_CLASSE).setValue(trouve.classe);
      feuille.getRange(ligne, COL_NAISSANCE).setValue(trouve.naissance);
    }
  }

  var valeurs = feuille.getRange(ligne, 1, 1, COLONNES.length).getValues()[0];
  var eleve = String(valeurs[COL_ELEVE - 1] || '').trim();
  // Le libelle complet peut subsister si la liste n'a pas ete reconnue : on garde le nom seul.
  if (eleve.indexOf(SEPARATEUR) >= 0) eleve = eleve.split(SEPARATEUR)[0].trim();
  var debut = dateTexte_(valeurs[COL_DEBUT - 1]);
  if (!eleve || !debut) return; // Ligne encore incomplete : on attend.

  var celluleEtat = feuille.getRange(ligne, COL_ETAT);
  try {
    var reponse = appeler_({
      action: 'ecrire',
      ligne: {
        id: String(valeurs[COL_ID - 1] || '').trim(),
        eleve: eleve,
        classe: String(valeurs[COL_CLASSE - 1] || '').trim(),
        debut: debut,
        fin: dateTexte_(valeurs[COL_FIN - 1]) || debut,
        famille: String(valeurs[COL_FAMILLE - 1] || '').trim(),
        motif: String(valeurs[COL_MOTIF - 1] || '').trim(),
        aptitude: String(valeurs[COL_APTITUDE - 1] || '').trim(),
        adapte: String(valeurs[COL_ADAPTE - 1] || '').trim()
      }
    });
    // Rendre l'identifiant au Sheet : sans lui, la meme ligne serait recreee a chaque correction.
    if (reponse.id) feuille.getRange(ligne, COL_ID).setValue(reponse.id);
    celluleEtat.setValue('✓ ' + (reponse.statut || 'enregistrée')).setFontColor('#0f7b3f');
  } catch (erreur) {
    // Un refus doit se voir sur la ligne concernee : une erreur muette ferait croire a un envoi.
    celluleEtat.setValue('⚠ ' + erreur.message).setFontColor('#c0392b');
  }
}

/** Supprime la dispense de la ligne ou se trouve le curseur. */
function supprimerLigneSelectionnee() {
  // L'onglet actif, pas le premier : une dispense terminee se supprime aussi, depuis "Passées".
  var feuille = classeur_().getActiveSheet();
  var ui = SpreadsheetApp.getUi();
  if (feuille.getName() === ONGLET_ELEVES) {
    ui.alert('Cet onglet ne contient pas de dispenses.'); return;
  }
  var ligne = feuille.getActiveRange().getRow();
  if (ligne < PREMIERE_LIGNE) { ui.alert('Placez-vous sur la ligne à supprimer.'); return; }

  var id = String(feuille.getRange(ligne, COL_ID).getValue() || '').trim();
  var eleve = String(feuille.getRange(ligne, COL_ELEVE).getValue() || '');
  if (!id) { ui.alert('Cette ligne n’est pas encore enregistrée : il suffit de l’effacer.'); return; }
  if (ui.alert('Supprimer la dispense de ' + eleve + ' ?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  try {
    appeler_({ action: 'supprimer', id: id });
    feuille.deleteRow(ligne);
  } catch (erreur) {
    ui.alert('Suppression refusée : ' + erreur.message);
  }
}
