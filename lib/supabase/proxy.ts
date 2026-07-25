import { createServerClient } from "@supabase/ssr";

import { NextResponse, type NextRequest } from "next/server";

import { isMfaVerificationRequired } from "@/lib/auth-mfa";
import {
  getSubscribeRequiredPath,
  getSubscriptionAccessForUser,
} from "@/lib/subscription";



export async function updateSession(request: NextRequest) {

  let response = NextResponse.next({

    request,

  });



  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabasePublishableKey =

    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;



  if (!supabaseUrl || !supabasePublishableKey) {

    throw new Error(

      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",

    );

  }



  const supabase = createServerClient(

    supabaseUrl,

    supabasePublishableKey,

    {

      cookies: {

        getAll() {

          return request.cookies.getAll();

        },



        setAll(cookiesToSet) {

          cookiesToSet.forEach(({ name, value }) => {

            request.cookies.set(name, value);

          });



          response = NextResponse.next({

            request,

          });



          cookiesToSet.forEach(({ name, value, options }) => {

            response.cookies.set(name, value, options);

          });

        },

      },

    },

  );



  const {

    data: { user },

  } = await supabase.auth.getUser();



  const pathname = request.nextUrl.pathname;

  const { data: assuranceLevel } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  const mfaVerificationRequired = isMfaVerificationRequired(assuranceLevel);



  if (!user) {

    return response;

  }



  if (mfaVerificationRequired && pathname.startsWith("/dashboard")) {

    const redirectUrl = request.nextUrl.clone();

    redirectUrl.pathname = "/login";

    redirectUrl.search = "";

    return NextResponse.redirect(redirectUrl);

  }



  const access = await getSubscriptionAccessForUser(

    supabase,

    user.id,

    user.email,

  );



  if (access.hasAccess) {

    if (pathname === "/login" || pathname === "/signup") {

      if (!mfaVerificationRequired) {

        return NextResponse.redirect(new URL("/dashboard", request.url));

      }

    }



    return response;

  }



  if (pathname.startsWith("/dashboard")) {

    const redirectUrl = request.nextUrl.clone();

    redirectUrl.pathname = "/";

    redirectUrl.search = "";



    const subscribePath = getSubscribeRequiredPath(access.reason, {

      setup: access.reason === "setup_required" || access.reason === "missing",

    });



    return NextResponse.redirect(new URL(subscribePath, request.url));

  }



  if (pathname === "/login" || pathname === "/signup") {

    const subscribePath = getSubscribeRequiredPath(access.reason, {

      setup: true,

    });



    return NextResponse.redirect(new URL(subscribePath, request.url));

  }



  return response;

}

