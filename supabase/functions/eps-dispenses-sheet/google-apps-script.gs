/**
 * Script a coller dans le Google Sheet partage avec l'infirmerie.
 * (Sheet > Extensions > Apps Script, remplacer tout le contenu, puis Enregistrer.)
 *
 * Ce que fait ce script :
 *   - toutes les 5 minutes, il relit les dispenses de la base et reecrit le tableau ;
 *   - des qu'une ligne est saisie ou corrigee dans le Sheet, il l'envoie dans la base ;
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
var COLONNES = ['id', 'Élève', 'Classe', 'Début', 'Fin', 'Famille', 'Motif', 'État'];
var COL_ID = 1, COL_ELEVE = 2, COL_CLASSE = 3, COL_DEBUT = 4, COL_FIN = 5,
    COL_FAMILLE = 6, COL_MOTIF = 7, COL_ETAT = 8;
var PREMIERE_LIGNE = 2;

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

function feuille_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

/** Une date de cellule (objet Date ou texte) ramenee au format attendu par la base. */
function dateTexte_(valeur) {
  if (valeur instanceof Date) {
    return Utilities.formatDate(valeur, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(valeur || '').trim().slice(0, 10);
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
 * Reecrit le tableau avec l'etat de la base.
 *
 * Le tableau est reconstruit en entier : la base fait foi. Une saisie faite ici est deja partie
 * (voir auSurEdition) au moment ou elle est reecrite, elle n'est donc jamais perdue.
 */
function actualiser() {
  var reponse = appeler_({ action: 'lister' });
  var lignes = reponse.lignes || [];
  var feuille = feuille_();

  feuille.getRange(1, 1, 1, COLONNES.length).setValues([COLONNES])
    .setFontWeight('bold').setBackground('#0876d1').setFontColor('#ffffff');

  var dernier = feuille.getLastRow();
  if (dernier >= PREMIERE_LIGNE) {
    feuille.getRange(PREMIERE_LIGNE, 1, dernier - PREMIERE_LIGNE + 1, COLONNES.length).clearContent();
  }
  if (lignes.length) {
    var valeurs = lignes.map(function (l) {
      return [l.id, l.eleve, l.classe, l.debut, l.fin, l.famille, l.motif, ''];
    });
    feuille.getRange(PREMIERE_LIGNE, 1, valeurs.length, COLONNES.length).setValues(valeurs);
  }

  // La colonne des identifiants ne sert qu'a retrouver la ligne : elle n'a rien a dire a l'oeil.
  feuille.hideColumns(COL_ID);
  feuille.setFrozenRows(1);
  SpreadsheetApp.getActiveSpreadsheet().toast(lignes.length + ' dispense(s)', 'Actualisé', 3);
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
  var ligne = e.range.getRow();
  if (ligne < PREMIERE_LIGNE) return;
  // Une modification de la colonne État est la notre : ne pas repartir en boucle.
  if (e.range.getColumn() === COL_ETAT) return;

  var valeurs = feuille.getRange(ligne, 1, 1, COLONNES.length).getValues()[0];
  var eleve = String(valeurs[COL_ELEVE - 1] || '').trim();
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
        motif: String(valeurs[COL_MOTIF - 1] || '').trim()
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
  var feuille = feuille_();
  var ligne = feuille.getActiveRange().getRow();
  var ui = SpreadsheetApp.getUi();
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
