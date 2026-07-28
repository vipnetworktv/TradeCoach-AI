import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function ConnectBrokerPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  redirect("/dashboard/accounts/connect/tradingview");
}
