import "server-only";

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
<tr><td style="background:#1b2f6b;border-bottom:4px solid #c62032;padding:18px 24px;color:#ffffff;font-family:Georgia,serif;font-weight:bold;letter-spacing:1px">THE MAURITIUS TURF CLUB</td></tr>
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
