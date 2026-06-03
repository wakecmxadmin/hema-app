const DEFAULT_DOMAINS = ['hemacereais.com.br', 'pinho.com.br'];

export function getStaffDomains(): string[] {
  const raw = process.env.STAFF_EMAIL_DOMAIN;
  if (!raw) return DEFAULT_DOMAINS;
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

export function isStaffEmail(
  email: string | null | undefined,
  emailConfirmedAt: string | null | undefined,
): boolean {
  if (!emailConfirmedAt) return false;
  if (!email) return false;
  const lower = email.toLowerCase();
  return getStaffDomains().some((d) => lower.endsWith(`@${d}`));
}
