import { redirect } from "next/navigation";

/** Phone signup was removed. Registration is email only. */
export default function OnboardingPhonePage() {
  redirect("/onboarding/email");
}
