/**
 * Branded ReWorth transactional email (HTML + plain text).
 * Deliverability-safe: no hidden cloaking text, no localhost CTAs,
 * single primary link, matching plain-text body.
 */

export type EmailCta = {
  label: string;
  url: string;
};

export type TransactionalEmailInput = {
  /** Optional short line shown under the title (visible, not hidden). */
  preview?: string;
  title: string;
  greeting?: string;
  paragraphs: string[];
  cta?: EmailCta;
  footerNote?: string;
  appUrl?: string;
};

const BRAND = {
  canvas: '#F4F6F5',
  card: '#FFFFFF',
  ink: '#111315',
  muted: '#5C636A',
  border: '#E5E2DC',
  emerald: '#0E9F6E',
  wash: '#E6F6EF',
} as const;

const FONT =
  "Arial, Helvetica, sans-serif";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Extract addr from `Name <addr@host>` or bare address. */
export function parseFromAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim();
}

export function isNoReplyAddress(from: string): boolean {
  const local = parseFromAddress(from).split('@')[0]?.toLowerCase() ?? '';
  return /^(no[\-_]?reply|donotreply|do[\-_]?not[\-_]?reply)$/.test(local);
}

/**
 * Prefer EMAIL_APP_URL / public APP_URL. Drop localhost / .local hosts —
 * those links are a common spam trigger when mailed to real inboxes.
 */
export function resolvePublicAppUrl(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const raw of candidates) {
    if (!raw?.trim()) continue;
    const cleaned = raw.trim().replace(/\/$/, '');
    try {
      const u = new URL(cleaned);
      const host = u.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.endsWith('.local')
      ) {
        continue;
      }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
      return cleaned;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function renderTransactionalEmail(input: TransactionalEmailInput): {
  text: string;
  html: string;
} {
  const appUrl = resolvePublicAppUrl(input.appUrl);
  const paragraphs = input.paragraphs.filter((p) => p.trim().length > 0);
  const cta =
    input.cta && resolvePublicAppUrl(input.cta.url)
      ? { ...input.cta, url: resolvePublicAppUrl(input.cta.url)! }
      : undefined;
  const footer = input.footerNote ?? 'Thanks,\nThe ReWorth Team';

  const textBlocks: string[] = [];
  if (input.greeting) textBlocks.push(input.greeting);
  textBlocks.push(...paragraphs);
  if (cta) textBlocks.push(`${cta.label}: ${cta.url}`);
  textBlocks.push(footer);
  if (appUrl) textBlocks.push(appUrl);
  const text = textBlocks.join('\n\n').trim();

  const greetingHtml = input.greeting
    ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${BRAND.ink};font-family:${FONT};">${escapeHtml(input.greeting)}</p>`
    : '';

  const paragraphHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${BRAND.ink};font-family:${FONT};">${escapeHtml(p)}</p>`,
    )
    .join('');

  const previewHtml = input.preview
    ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.45;color:${BRAND.muted};font-family:${FONT};">${escapeHtml(input.preview)}</p>`
    : '';

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
        <tr>
          <td bgcolor="${BRAND.emerald}" style="border-radius:8px;background-color:${BRAND.emerald};">
            <a href="${escapeHtml(cta.url)}"
               style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;font-family:${FONT};">
              ${escapeHtml(cta.label)}
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const footerHtml = `<p style="margin:0;font-size:14px;line-height:1.5;color:${BRAND.muted};font-family:${FONT};">${escapeHtml(footer).replace(/\n/g, '<br />')}</p>`;

  const siteHtml = appUrl
    ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.45;color:${BRAND.muted};font-family:${FONT};">
        <a href="${escapeHtml(appUrl)}" style="color:${BRAND.emerald};text-decoration:none;">${escapeHtml(appUrl.replace(/^https?:\/\//, ''))}</a>
      </p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.canvas};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.canvas};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:${BRAND.card};border:1px solid ${BRAND.border};border-radius:12px;">
          <tr>
            <td style="padding:20px 28px;background-color:${BRAND.wash};border-bottom:1px solid ${BRAND.border};border-radius:12px 12px 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="10" height="10" bgcolor="${BRAND.emerald}" style="width:10px;height:10px;background-color:${BRAND.emerald};border-radius:999px;font-size:0;line-height:0;">&nbsp;</td>
                  <td style="padding-left:10px;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.emerald};font-family:${FONT};">
                    ReWorth
                  </td>
                </tr>
              </table>
              <h1 style="margin:14px 0 0;font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.ink};font-family:${FONT};">
                ${escapeHtml(input.title)}
              </h1>
              ${previewHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              ${greetingHtml}
              ${paragraphHtml}
              ${ctaHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px;border-top:1px solid ${BRAND.border};">
              ${footerHtml}
              ${siteHtml}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;max-width:560px;font-size:11px;line-height:1.45;color:${BRAND.muted};font-family:${FONT};">
          Sent by ReWorth because you have an account with us.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { text, html };
}

/** Wrap free-form notification body in the brand shell. */
export function renderNotificationEmail(opts: {
  title: string;
  body: string;
  deepLink?: string | null;
  appUrl?: string;
}): { text: string; html: string } {
  const appUrl = resolvePublicAppUrl(opts.appUrl);
  const ctaUrl = opts.deepLink
    ? opts.deepLink.startsWith('http')
      ? resolvePublicAppUrl(opts.deepLink)
      : appUrl
        ? `${appUrl}${opts.deepLink.startsWith('/') ? '' : '/'}${opts.deepLink}`
        : undefined
    : undefined;

  const paragraphs = opts.body
    .split(/\n\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return renderTransactionalEmail({
    preview: paragraphs[0]?.slice(0, 110) ?? opts.title,
    title: opts.title,
    paragraphs,
    cta:
      ctaUrl && resolvePublicAppUrl(ctaUrl)
        ? { label: 'Open in ReWorth', url: ctaUrl }
        : undefined,
    appUrl,
    footerNote: 'Thanks,\nThe ReWorth Team',
  });
}
