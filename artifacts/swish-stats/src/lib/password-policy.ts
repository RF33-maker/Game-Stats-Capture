// The accounts are shared with swishassistant.com, so the password rule is the
// same one the site enforces when it registers someone.

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENTS = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p: string) => p.length >= PASSWORD_MIN_LENGTH },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
] as const;

/** Null when the password meets every requirement, otherwise the first unmet one. */
export function validatePassword(password: string): string | null {
  for (const { label, test } of PASSWORD_REQUIREMENTS) {
    if (!test(password)) return `Password needs: ${label.toLowerCase()}`;
  }
  return null;
}
