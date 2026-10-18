import { redirect } from "next/navigation";

/** OTP signup was removed. Registration is email only. */
export default function OnboardingOtpPage() {
  redirect("/onboarding/email");
}
