import "server-only";
import { appBaseUrl } from "./config";

/**
 * Applicant-facing email templates, in French. These are the defaults; they
 * move to the editable email_templates table with the Administration module (NOT-02).
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#16181d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4ef;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2dcd0;border-radius:8px">
<tr><td style="padding:16px 24px;border-bottom:1px solid #e2dcd0"><img src="${esc(appBaseUrl())}/mtcjc-logo.png" width="81" height="60" alt="MTC Jockey Club" style="display:block;border:0"></td></tr>
<tr><td style="padding:28px 24px;font-size:15px;line-height:1.55">
<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:22px;color:#13224f">${esc(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2dcd0;font-size:12px;color:#5b606b">The Mauritius Turf Club · Champ de Mars, Port Louis · Ce message a été envoyé automatiquement.</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;background:#1b2f6b;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:6px">${esc(label)}</a></p>
<p style="font-size:13px;color:#5b606b">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all">${esc(href)}</span></p>`;
}

export function verificationEmail(name: string, link: string) {
  const subject = "Confirmez votre adresse courriel – Mauritius Turf Club";
  const html = layout(
    "Confirmez votre adresse courriel",
    `<p>Bonjour ${esc(name)},</p>
<p>Merci d’avoir créé votre compte sur le portail des membres du Mauritius Turf Club. Pour l’activer, veuillez confirmer votre adresse courriel.</p>
${button(link, "Confirmer mon adresse")}
<p style="font-size:13px;color:#5b606b">Ce lien est valable 24 heures. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p>`,
  );
  const text = `Bonjour ${name},\n\nPour activer votre compte sur le portail des membres du Mauritius Turf Club, confirmez votre adresse courriel en ouvrant ce lien (valable 24 heures) :\n${link}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.`;
  return { subject, html, text };
}

export function accountExistsEmail(name: string, loginLink: string, resetLink: string) {
  const subject = "Votre compte existe déjà – Mauritius Turf Club";
  const html = layout(
    "Vous avez déjà un compte",
    `<p>Bonjour ${esc(name)},</p>
<p>Une demande de création de compte a été faite avec cette adresse courriel, mais un compte existe déjà.</p>
${button(loginLink, "Se connecter")}
<p>Mot de passe oublié ? <a href="${esc(resetLink)}" style="color:#1b2f6b">Réinitialisez-le ici</a>.</p>`,
  );
  const text = `Bonjour ${name},\n\nUn compte existe déjà avec cette adresse courriel.\nSe connecter : ${loginLink}\nMot de passe oublié : ${resetLink}`;
  return { subject, html, text };
}

export function passwordResetEmail(name: string, link: string) {
  const subject = "Réinitialisation de votre mot de passe – Mauritius Turf Club";
  const html = layout(
    "Réinitialiser votre mot de passe",
    `<p>Bonjour ${esc(name)},</p>
<p>Vous avez demandé à réinitialiser le mot de passe de votre compte.</p>
${button(link, "Choisir un nouveau mot de passe")}
<p style="font-size:13px;color:#5b606b">Ce lien est valable 1 heure. Si vous n’avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.</p>`,
  );
  const text = `Bonjour ${name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${link}\n\nSi vous n’avez rien demandé, ignorez ce message.`;
  return { subject, html, text };
}

export function applicationSubmittedEmail(name: string, reference: string, trackLink: string) {
  const subject = `Candidature ${reference} reçue – Mauritius Turf Club`;
  const html = layout(
    "Votre candidature a bien été reçue",
    `<p>Bonjour ${esc(name)},</p>
<p>Nous accusons réception de votre candidature <strong>${esc(reference)}</strong> pour devenir Membre du Mauritius Turf Club.</p>
<p>Prochaines étapes :</p>
<ol style="padding-left:20px">
<li>Vos parrains reçoivent un courriel les invitant à confirmer leur parrainage.</li>
<li>Le Club examine votre dossier (vérification des documents et Compliance Review).</li>
<li>Vous serez informé(e) de la décision par courriel.</li>
</ol>
<p>Nous vous rappelons que le dépôt de ce formulaire ne constitue ni une admission, ni un droit à devenir membre du Club.</p>
${button(trackLink, "Suivre ma candidature")}`,
  );
  const text = `Bonjour ${name},\n\nNous accusons réception de votre candidature ${reference}.\nVos parrains vont recevoir un courriel de confirmation, puis le Club examinera votre dossier. Vous serez informé(e) de la décision par courriel.\n\nSuivre ma candidature : ${trackLink}`;
  return { subject, html, text };
}

export function sponsorRequestEmail(
  sponsorName: string,
  applicantName: string,
  reference: string,
  link: string,
) {
  const subject = `Demande de parrainage pour ${applicantName} – Mauritius Turf Club`;
  const html = layout(
    "Demande de parrainage",
    `<p>Bonjour ${esc(sponsorName)},</p>
<p><strong>${esc(applicantName)}</strong> a déposé une candidature (${esc(reference)}) pour devenir Membre du Mauritius Turf Club et vous a indiqué(e) comme parrain.</p>
<p>Merci de confirmer ou de décliner ce parrainage. Votre confirmation électronique remplace la signature sur le formulaire papier.</p>
${button(link, "Répondre à la demande")}
<p style="font-size:13px;color:#5b606b">Si vous ne connaissez pas cette personne, choisissez « Je décline » sur la page.</p>`,
  );
  const text = `Bonjour ${sponsorName},\n\n${applicantName} a déposé une candidature (${reference}) pour devenir Membre du Mauritius Turf Club et vous a indiqué(e) comme parrain.\nMerci de confirmer ou de décliner ce parrainage : ${link}`;
  return { subject, html, text };
}

export function applicationApprovedEmail(p: {
  name: string;
  reference: string;
  typeName: string;
  feeLabel: string;
  dueLabel: string;
  conditions: string | null;
  link: string;
}) {
  const subject = `Candidature ${p.reference} approuvée – Mauritius Turf Club`;
  const html = layout(
    "Votre candidature a été approuvée",
    `<p>Bonjour ${esc(p.name)},</p>
<p>Nous avons le plaisir de vous informer que votre candidature <strong>${esc(p.reference)}</strong> en qualité de <strong>${esc(p.typeName)}</strong> a été approuvée.</p>
<p><strong>Cotisation :</strong> ${esc(p.feeLabel)}</p>
${p.conditions ? `<p><strong>Conditions d’adhésion :</strong><br>${esc(p.conditions).replace(/\n/g, "<br>")}</p>` : ""}
<p>Votre adhésion prendra effet dès réception de votre paiement, à effectuer au plus tard le <strong>${esc(p.dueLabel)}</strong> (5 jours ouvrables). Passé ce délai, votre candidature sera automatiquement différée.</p>
${button(p.link, "Régler ma cotisation")}`,
  );
  const text = `Bonjour ${p.name},\n\nVotre candidature ${p.reference} (${p.typeName}) a été approuvée.\nCotisation : ${p.feeLabel}\n${p.conditions ? `Conditions : ${p.conditions}\n` : ""}Paiement à effectuer au plus tard le ${p.dueLabel} : ${p.link}`;
  return { subject, html, text };
}

export function applicationDeferredEmail(name: string, reference: string, comment: string, link: string, automatic = false) {
  const subject = `Candidature ${reference} différée – Mauritius Turf Club`;
  const html = layout(
    "Votre candidature a été différée",
    `<p>Bonjour ${esc(name)},</p>
<p>Votre candidature <strong>${esc(reference)}</strong> a été différée${automatic ? "" : " par le Club"}.</p>
<p><strong>Motif :</strong><br>${esc(comment).replace(/\n/g, "<br>")}</p>
<p>Vous pouvez modifier votre dossier et le soumettre à nouveau depuis votre espace.</p>
${button(link, "Modifier ma candidature")}`,
  );
  const text = `Bonjour ${name},\n\nVotre candidature ${reference} a été différée.\nMotif : ${comment}\n\nModifier votre candidature : ${link}`;
  return { subject, html, text };
}

export function applicationRejectedEmail(name: string, reference: string, comment: string) {
  const subject = `Candidature ${reference} – décision du Mauritius Turf Club`;
  const html = layout(
    "Décision concernant votre candidature",
    `<p>Bonjour ${esc(name)},</p>
<p>Après examen, le Club n’est pas en mesure de donner une suite favorable à votre candidature <strong>${esc(reference)}</strong>.</p>
<p><strong>Commentaire :</strong><br>${esc(comment).replace(/\n/g, "<br>")}</p>
<p>Conformément aux Statuts du Club, cette décision relève de l’appréciation discrétionnaire des Administrateurs.</p>`,
  );
  const text = `Bonjour ${name},\n\nLe Club n’est pas en mesure de donner une suite favorable à votre candidature ${reference}.\nCommentaire : ${comment}`;
  return { subject, html, text };
}
