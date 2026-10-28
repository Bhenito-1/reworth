/** Inbox for suspension appeals. */
export const SUSPENSION_APPEAL_EMAIL = 'reworthhub@gmail.com';

/** Shown when a suspended user tries to sign in or use an existing session. */
export function suspendedAccountMessage(): string {
  return `Account suspended. Contact the ReWorth team via email at ${SUSPENSION_APPEAL_EMAIL} to lift the suspension.`;
}
