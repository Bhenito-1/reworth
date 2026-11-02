import { findPhoneNumbersInText } from "libphonenumber-js";
import { isEmail } from "validator";

const EMAIL_CANDIDATE_RE = /[^\s<>()[\]{}"']+@[^\s<>()[\]{}"']+/g;
const EMAIL_TRAILING_PUNCTUATION_RE = /[.,!?;:]+$/;

/** Detect contact details that are prohibited in ReWorth chat text. */
export function containsProhibitedChatContact(text: string): boolean {
  const emails = text.match(EMAIL_CANDIDATE_RE) ?? [];
  if (
    emails.some((candidate) =>
      isEmail(candidate.replace(EMAIL_TRAILING_PUNCTUATION_RE, "")),
    )
  ) {
    return true;
  }

  // NG parsing covers +234 international numbers and local 0-prefixed or
  // 10-digit national numbers, including common spaces and punctuation.
  return findPhoneNumbersInText(text, "NG").some(({ number }) =>
    number.isValid(),
  );
}

export const PROHIBITED_CHAT_WARNING =
  "This message contains prohibited information. Remove phone numbers and email addresses before sending.";
