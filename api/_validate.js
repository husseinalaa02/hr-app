/**
 * Shared server-side validators used by multiple API routes.
 */

/**
 * Validates password complexity. Returns an error message string, or null if valid.
 * Rules: min 8 chars, at least one uppercase letter, at least one digit.
 */
export function validatePassword(pw) {
  if (!pw || pw.length < 8)       return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pw))          return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(pw))          return 'Password must contain at least one number';
  return null;
}
