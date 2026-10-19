import { redirect } from "next/navigation";

/** The phone-or-email chooser was removed. Registration is email only. */
export default function OnboardingMethodPage() {
  redirect("/onboarding/email");
}
