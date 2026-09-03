import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/rbac";
import { loadHomeContent } from "@/server/services/home";
import { getActiveCode } from "@/server/services/guest-access";
import { HomeHeader } from "@/components/home/home-header";
import { HomeHero } from "@/components/home/home-hero";
import { HomeStats } from "@/components/home/home-stats";
import { HomeGuestBanner } from "@/components/home/home-guest-banner";
import { HomeFeatures } from "@/components/home/home-features";
import { HomeSteps } from "@/components/home/home-steps";
import { HomeFaq } from "@/components/home/home-faq";
import { HomeCta } from "@/components/home/home-cta";
import { HomeFooter } from "@/components/home/home-footer";

/**
 * Rendered per request, never prerendered.
 *
 * This page is already dynamic in practice — it reads the session to redirect signed-in
 * visitors, and `searchParams` for `?preview` — so Next.js bails out of the static pass on
 * its own. Declaring it removes a build-time race that bailout leaves behind: `next build`
 * still *attempts* a prerender, and `generateMetadata` below opens a database connection
 * while the page body is reaching for cookies. Whichever finishes first decides the build.
 *
 * A slow database failure loses that race harmlessly (the cookie bailout aborts the attempt),
 * but a fast one — no `MONGODB_URI`, a bad host, a paused Atlas cluster — throws before the
 * bailout and fails the whole build with an opaque "Error occurred prerendering page /".
 * With `force-dynamic` there is no static pass, so a deploy no longer depends on the database
 * being reachable from the build container.
 */
export const dynamic = "force-dynamic";

/**
 * Title and description are admin-editable, falling through to the root layout's defaults
 * when left blank. The absolute form is used so the layout's "%s · ExamPrep" template
 * doesn't append the brand to a title an admin wrote in full.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await loadHomeContent();

  return {
    ...(settings.metaTitle ? { title: { absolute: settings.metaTitle } } : {}),
    ...(settings.metaDescription ? { description: settings.metaDescription } : {}),
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { preview?: string };
}) {
  const user = await getCurrentUser();

  // Signed-in visitors are sent to their own area — but an admin editing this page has to be
  // able to look at it, and the redirect would otherwise bounce them back to the dashboard.
  // `?preview` opts out of the redirect, for admins only.
  const previewing = user?.role === "ADMIN" && searchParams.preview !== undefined;

  if (user && !previewing) {
    redirect(user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");
  }

  const [{ settings, blocks, stats }, accessCode] = await Promise.all([
    loadHomeContent(),
    // Only `isEnabled` is read here — the code itself is never sent to an anonymous visitor.
    getActiveCode(),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <HomeHeader brandLabel={settings.brandLabel} guestAccessEnabled={accessCode.isEnabled} />

      <main className="flex-1">
        <HomeHero
          badge={settings.heroBadge}
          title={settings.heroTitle}
          subtitle={settings.heroSubtitle}
          primaryLabel={settings.heroPrimaryLabel}
          primaryHref={settings.heroPrimaryHref}
          secondaryLabel={settings.heroSecondaryLabel}
          secondaryHref={settings.heroSecondaryHref}
        />

        {accessCode.isEnabled && <HomeGuestBanner />}

        {settings.statsEnabled && <HomeStats stats={stats} />}

        {settings.featuresEnabled && (
          <HomeFeatures
            title={settings.featuresTitle}
            subtitle={settings.featuresSubtitle}
            features={blocks.FEATURE}
          />
        )}

        {settings.stepsEnabled && (
          <HomeSteps
            title={settings.stepsTitle}
            subtitle={settings.stepsSubtitle}
            steps={blocks.STEP}
          />
        )}

        {settings.faqEnabled && (
          <HomeFaq title={settings.faqTitle} subtitle={settings.faqSubtitle} faqs={blocks.FAQ} />
        )}

        {settings.ctaEnabled && (
          <HomeCta
            title={settings.ctaTitle}
            body={settings.ctaBody}
            buttonLabel={settings.ctaButtonLabel}
            buttonHref={settings.ctaButtonHref}
          />
        )}
      </main>

      <HomeFooter
        brandLabel={settings.brandLabel}
        tagline={settings.footerTagline}
        links={blocks.LINK}
      />
    </div>
  );
}
