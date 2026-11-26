import { redirect } from "next/navigation";

/** Cart checkout uses the same page as listing checkout. */
export default function CartCheckoutRedirect() {
  redirect("/checkout?cart=1");
}