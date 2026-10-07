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
    .replace(/['’.-]/g, '')
    .replace(/\s+/g, ' ');
}

export function namesMatch(entered: LegalName, nibss: LegalName): boolean {
  return (
    fold(entered.firstName) === fold(nibss.firstName) &&
    fold(entered.middleName) === fold(nibss.middleName) &&
    fold(entered.lastName) === fold(nibss.lastName) &&
    fold(entered.firstName).length > 0 &&
    fold(entered.lastName).length > 0
  );
}
