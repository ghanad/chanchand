import { redirect } from "next/navigation";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const tab = params?.tab;
  const paymentStatus = params?.payment_status;

  if (tab === "payments" || tab === "quota" || paymentStatus) {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") {
        sp.set(key, value);
      }
    }
    const query = sp.toString() ? `?${sp.toString()}` : "";
    redirect(`/account/wallet${query}`);
  }

  redirect("/account/profile");
}
