"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HomeSettingsCard } from "@/components/admin/home-settings-card";
import {
  HomeBlockManager,
  type HomeBlockRow,
  type HomeBlockKindName,
} from "@/components/admin/home-block-manager";
import type { MetricPreview } from "@/components/admin/home-block-form-dialog";

/** Mirrors the `home_page` content columns, with optional text as null rather than absent. */
export type HomeSettingsRow = {
  brandLabel: string;
  heroBadge: string | null;
  heroTitle: string;
  heroSubtitle: string | null;
  heroPrimaryLabel: string;
  heroPrimaryHref: string;
  heroSecondaryLabel: string | null;
  heroSecondaryHref: string | null;
  statsEnabled: boolean;
  featuresEnabled: boolean;
  featuresTitle: string;
  featuresSubtitle: string | null;
  stepsEnabled: boolean;
  stepsTitle: string;
  stepsSubtitle: string | null;
  faqEnabled: boolean;
  faqTitle: string;
  faqSubtitle: string | null;
  ctaEnabled: boolean;
  ctaTitle: string;
  ctaBody: string | null;
  ctaButtonLabel: string;
  ctaButtonHref: string;
  footerTagline: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

type Props = {
  settings: HomeSettingsRow;
  blocks: Record<HomeBlockKindName, HomeBlockRow[]>;
  metrics: MetricPreview;
};

/** Empty inputs and absent values are both "" in the form; the API turns "" back into null. */
const text = (value: string | null) => value ?? "";

export function HomeContentManager({ settings, blocks, metrics }: Props) {
  return (
    <Tabs defaultValue="hero">
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="hero">Hero</TabsTrigger>
        <TabsTrigger value="stats">Stats</TabsTrigger>
        <TabsTrigger value="features">Features</TabsTrigger>
        <TabsTrigger value="steps">How it works</TabsTrigger>
        <TabsTrigger value="faq">FAQ</TabsTrigger>
        <TabsTrigger value="cta">Call to action</TabsTrigger>
        <TabsTrigger value="footer">Footer &amp; SEO</TabsTrigger>
      </TabsList>

      {/* ------------------------------------------------------------------ Hero */}
      <TabsContent value="hero">
        <HomeSettingsCard
          title="Hero"
          description="The first screen a visitor sees, and the name shown in the header and footer."
          initial={{
            brandLabel: settings.brandLabel,
            heroBadge: text(settings.heroBadge),
            heroTitle: settings.heroTitle,
            heroSubtitle: text(settings.heroSubtitle),
            heroPrimaryLabel: settings.heroPrimaryLabel,
            heroPrimaryHref: settings.heroPrimaryHref,
            heroSecondaryLabel: text(settings.heroSecondaryLabel),
            heroSecondaryHref: text(settings.heroSecondaryHref),
          }}
        >
          {({ values, set }) => (
            <>
              <Field
                id="brandLabel"
                label="Site name"
                hint="Used in the header wordmark and the footer."
                value={values.brandLabel}
                onChange={(v) => set("brandLabel", v)}
                required
                maxLength={40}
              />

              <Field
                id="heroBadge"
                label="Badge"
                hint="The small pill above the headline. Leave blank to remove it."
                value={values.heroBadge}
                onChange={(v) => set("heroBadge", v)}
                maxLength={60}
                placeholder="e.g. Computer-based test practice"
              />

              <div className="space-y-1.5">
                <Label htmlFor="heroTitle">Headline</Label>
                <Textarea
                  id="heroTitle"
                  required
                  rows={2}
                  maxLength={160}
                  value={values.heroTitle}
                  onChange={(e) => set("heroTitle", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="heroSubtitle">Sub-heading</Label>
                <Textarea
                  id="heroSubtitle"
                  rows={3}
                  maxLength={400}
                  value={values.heroSubtitle}
                  onChange={(e) => set("heroSubtitle", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to show just the headline.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="heroPrimaryLabel"
                  label="Primary button"
                  value={values.heroPrimaryLabel}
                  onChange={(v) => set("heroPrimaryLabel", v)}
                  required
                  maxLength={40}
                />
                <Field
                  id="heroPrimaryHref"
                  label="Primary button link"
                  value={values.heroPrimaryHref}
                  onChange={(v) => set("heroPrimaryHref", v)}
                  required
                  maxLength={500}
                  placeholder="/register"
                />
                <Field
                  id="heroSecondaryLabel"
                  label="Secondary button"
                  value={values.heroSecondaryLabel}
                  onChange={(v) => set("heroSecondaryLabel", v)}
                  maxLength={40}
                />
                <Field
                  id="heroSecondaryHref"
                  label="Secondary button link"
                  value={values.heroSecondaryHref}
                  onChange={(v) => set("heroSecondaryHref", v)}
                  maxLength={500}
                  placeholder="/login"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The secondary button is hidden unless both its label and link are filled in.
              </p>
            </>
          )}
        </HomeSettingsCard>
      </TabsContent>

      {/* ----------------------------------------------------------------- Stats */}
      <TabsContent value="stats" className="space-y-6">
        <HomeSettingsCard
          title="Stats band"
          description="A row of figures under the hero. Each one is either a fixed value or counted live from the database."
          initial={{ statsEnabled: settings.statsEnabled }}
        >
          {({ values, set }) => (
            <Toggle
              id="statsEnabled"
              label="Show the stats band"
              hint="Hides the whole row without deleting the individual stats."
              checked={values.statsEnabled}
              onChange={(v) => set("statsEnabled", v)}
            />
          )}
        </HomeSettingsCard>

        <BlockCard
          title="Stats"
          description="Four across on desktop reads best. A live percentage with no attempts behind it falls back to its fixed figure, and is dropped if that is blank too."
        >
          <HomeBlockManager kind="STAT" blocks={blocks.STAT} metrics={metrics} />
        </BlockCard>
      </TabsContent>

      {/* -------------------------------------------------------------- Features */}
      <TabsContent value="features" className="space-y-6">
        <HomeSettingsCard
          title="Features section"
          initial={{
            featuresEnabled: settings.featuresEnabled,
            featuresTitle: settings.featuresTitle,
            featuresSubtitle: text(settings.featuresSubtitle),
          }}
        >
          {({ values, set }) => (
            <>
              <Toggle
                id="featuresEnabled"
                label="Show the features section"
                checked={values.featuresEnabled}
                onChange={(v) => set("featuresEnabled", v)}
              />
              <Field
                id="featuresTitle"
                label="Heading"
                value={values.featuresTitle}
                onChange={(v) => set("featuresTitle", v)}
                required
                maxLength={120}
              />
              <Field
                id="featuresSubtitle"
                label="Sub-heading"
                value={values.featuresSubtitle}
                onChange={(v) => set("featuresSubtitle", v)}
                maxLength={240}
              />
            </>
          )}
        </HomeSettingsCard>

        <BlockCard title="Feature cards">
          <HomeBlockManager kind="FEATURE" blocks={blocks.FEATURE} metrics={metrics} />
        </BlockCard>
      </TabsContent>

      {/* ----------------------------------------------------------------- Steps */}
      <TabsContent value="steps" className="space-y-6">
        <HomeSettingsCard
          title="How-it-works section"
          initial={{
            stepsEnabled: settings.stepsEnabled,
            stepsTitle: settings.stepsTitle,
            stepsSubtitle: text(settings.stepsSubtitle),
          }}
        >
          {({ values, set }) => (
            <>
              <Toggle
                id="stepsEnabled"
                label="Show the how-it-works section"
                checked={values.stepsEnabled}
                onChange={(v) => set("stepsEnabled", v)}
              />
              <Field
                id="stepsTitle"
                label="Heading"
                value={values.stepsTitle}
                onChange={(v) => set("stepsTitle", v)}
                required
                maxLength={120}
              />
              <Field
                id="stepsSubtitle"
                label="Sub-heading"
                value={values.stepsSubtitle}
                onChange={(v) => set("stepsSubtitle", v)}
                maxLength={240}
              />
            </>
          )}
        </HomeSettingsCard>

        <BlockCard title="Steps" description="Numbered on the page in the order shown here.">
          <HomeBlockManager kind="STEP" blocks={blocks.STEP} metrics={metrics} numbered />
        </BlockCard>
      </TabsContent>

      {/* ------------------------------------------------------------------- FAQ */}
      <TabsContent value="faq" className="space-y-6">
        <HomeSettingsCard
          title="FAQ section"
          initial={{
            faqEnabled: settings.faqEnabled,
            faqTitle: settings.faqTitle,
            faqSubtitle: text(settings.faqSubtitle),
          }}
        >
          {({ values, set }) => (
            <>
              <Toggle
                id="faqEnabled"
                label="Show the FAQ section"
                checked={values.faqEnabled}
                onChange={(v) => set("faqEnabled", v)}
              />
              <Field
                id="faqTitle"
                label="Heading"
                value={values.faqTitle}
                onChange={(v) => set("faqTitle", v)}
                required
                maxLength={120}
              />
              <Field
                id="faqSubtitle"
                label="Sub-heading"
                value={values.faqSubtitle}
                onChange={(v) => set("faqSubtitle", v)}
                maxLength={240}
              />
            </>
          )}
        </HomeSettingsCard>

        <BlockCard title="Questions">
          <HomeBlockManager kind="FAQ" blocks={blocks.FAQ} metrics={metrics} />
        </BlockCard>
      </TabsContent>

      {/* ------------------------------------------------------------------- CTA */}
      <TabsContent value="cta">
        <HomeSettingsCard
          title="Closing call to action"
          description="The panel above the footer."
          initial={{
            ctaEnabled: settings.ctaEnabled,
            ctaTitle: settings.ctaTitle,
            ctaBody: text(settings.ctaBody),
            ctaButtonLabel: settings.ctaButtonLabel,
            ctaButtonHref: settings.ctaButtonHref,
          }}
        >
          {({ values, set }) => (
            <>
              <Toggle
                id="ctaEnabled"
                label="Show the call to action"
                checked={values.ctaEnabled}
                onChange={(v) => set("ctaEnabled", v)}
              />
              <Field
                id="ctaTitle"
                label="Heading"
                value={values.ctaTitle}
                onChange={(v) => set("ctaTitle", v)}
                required
                maxLength={120}
              />
              <div className="space-y-1.5">
                <Label htmlFor="ctaBody">Supporting line</Label>
                <Textarea
                  id="ctaBody"
                  rows={2}
                  maxLength={300}
                  value={values.ctaBody}
                  onChange={(e) => set("ctaBody", e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="ctaButtonLabel"
                  label="Button label"
                  value={values.ctaButtonLabel}
                  onChange={(v) => set("ctaButtonLabel", v)}
                  required
                  maxLength={40}
                />
                <Field
                  id="ctaButtonHref"
                  label="Button link"
                  value={values.ctaButtonHref}
                  onChange={(v) => set("ctaButtonHref", v)}
                  required
                  maxLength={500}
                  placeholder="/register"
                />
              </div>
            </>
          )}
        </HomeSettingsCard>
      </TabsContent>

      {/* -------------------------------------------------------- Footer and SEO */}
      <TabsContent value="footer" className="space-y-6">
        <HomeSettingsCard
          title="Footer"
          initial={{ footerTagline: text(settings.footerTagline) }}
        >
          {({ values, set }) => (
            <div className="space-y-1.5">
              <Label htmlFor="footerTagline">Tagline</Label>
              <Textarea
                id="footerTagline"
                rows={2}
                maxLength={200}
                value={values.footerTagline}
                onChange={(e) => set("footerTagline", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Sits under the site name. Leave blank to show the name on its own.
              </p>
            </div>
          )}
        </HomeSettingsCard>

        <BlockCard title="Footer links">
          <HomeBlockManager kind="LINK" blocks={blocks.LINK} metrics={metrics} />
        </BlockCard>

        <HomeSettingsCard
          title="Search engine listing"
          description="How the home page appears in search results and shared links. Both fall back to the site-wide defaults when blank."
          initial={{
            metaTitle: text(settings.metaTitle),
            metaDescription: text(settings.metaDescription),
          }}
        >
          {({ values, set }) => (
            <>
              <Field
                id="metaTitle"
                label="Page title"
                hint={`${values.metaTitle.length}/70 characters — search results usually cut off around 60.`}
                value={values.metaTitle}
                onChange={(v) => set("metaTitle", v)}
                maxLength={70}
              />
              <div className="space-y-1.5">
                <Label htmlFor="metaDescription">Meta description</Label>
                <Textarea
                  id="metaDescription"
                  rows={3}
                  maxLength={200}
                  value={values.metaDescription}
                  onChange={(e) => set("metaDescription", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {values.metaDescription.length}/200 characters — aim for 150 to 160.
                </p>
              </div>
            </>
          )}
        </HomeSettingsCard>
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Small shared bits of form furniture
// ---------------------------------------------------------------------------

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  required,
  maxLength,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div className="space-y-0.5 pr-4">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Wrapper so a block list sits in the same card frame as the settings forms. */
function BlockCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
