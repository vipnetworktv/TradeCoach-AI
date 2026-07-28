import { redirect } from "next/navigation";

import CTA from "@/components/CTA";
import Features from "@/components/Features";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import HomeCoachAvatars from "@/components/home-coach-avatars";
import HowItWorks from "@/components/HowItWorks";
import Navbar from "@/components/Navbar";
import Pricing from "@/components/Pricing";
import SubscribeRequiredGate from "@/components/subscribe-required-gate";
import { createClient } from "@/lib/supabase/server";
import {
  getSubscribeRequiredPath,
  getSubscriptionAccessForUser,
} from "@/lib/subscription";

type HomeProps = {
  searchParams?: Promise<{
    subscribe?: string;
    setup?: string;
    paypal?: string;
    access?: string;
    duplicate?: string;
    message?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const supabase = await createClient();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const subscriptionAccess = user
    ? await getSubscriptionAccessForUser(supabase, user.id, user.email)
    : null;

  const hasAccess = subscriptionAccess?.hasAccess ?? false;
  const showSubscribeGate = Boolean(user) && !hasAccess;

  if (user && hasAccess && resolvedSearchParams?.subscribe === "required") {
    redirect("/dashboard");
  }

  if (user && !hasAccess && !resolvedSearchParams?.subscribe) {
    redirect(
      getSubscribeRequiredPath(subscriptionAccess!.reason, {
        setup:
          subscriptionAccess!.reason === "setup_required" ||
          subscriptionAccess!.reason === "missing",
      }),
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <Navbar
        isAuthenticated={Boolean(user)}
        hasSubscriptionAccess={hasAccess}
      />
      <Hero isAuthenticated={Boolean(user)} />
      <HomeCoachAvatars />
      <Features />
      <HowItWorks />
      <Pricing />
      <CTA />
      <Footer />

      {showSubscribeGate && user ? (
        <SubscribeRequiredGate
          userEmail={user.email ?? "your account"}
          autoStart={resolvedSearchParams?.setup === "required"}
          accessReason={
            resolvedSearchParams?.access ?? subscriptionAccess?.reason
          }
          paypalStatus={resolvedSearchParams?.paypal}
          duplicateTrial={resolvedSearchParams?.duplicate === "1"}
          errorMessage={resolvedSearchParams?.message}
        />
      ) : null}
    </main>
  );
}
