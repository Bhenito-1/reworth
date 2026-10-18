export type LegalName = {
  firstName: string;
  middleName: string;
  lastName: string;
};

/** Split a resolved account name into first, middle, and last. */
export function splitAccountName(raw: string): LegalName {
  const parts = raw
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { firstName: '', middleName: '', lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], middleName: '', lastName: '' };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], middleName: '', lastName: parts[1] };
  }
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Each field is compared only with the same field.
 * A blank middle name does not match an account that has one.
 */
export function namesMatch(entered: LegalName, nibss: LegalName): boolean {
  const first = fold(entered.firstName);
  const last = fold(entered.lastName);
  if (!first || !last) return false;
  return (
    first === fold(nibss.firstName) &&
    fold(entered.middleName) === fold(nibss.middleName) &&
    last === fold(nibss.lastName)
  );
}
