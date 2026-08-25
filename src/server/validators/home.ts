import { z } from "zod";

import { HOME_ICON_NAMES } from "@/lib/home-icons";

/**
 * Optional free text.
 *
 * `.nullish()` is what makes the field genuinely optional — a bare `.nullable()` still
 * requires the key to be present. Absent, null, and "" all collapse to null, so clearing a
 * field in the form means "hide it". On the partial update schema the surrounding
 * `.partial()` short-circuits first, so an absent key stays absent rather than becoming an
 * unintended "clear this column".
 */
const optionalText = (max: number, label = "This field") =>
  z
    .string()
    .trim()
    .max(max, `${label} cannot exceed ${max} characters`)
    .nullish()
    .transform((value) => value || null);

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} cannot exceed ${max} characters`);

/**
 * Accepts a same-site path or an absolute http(s)/mailto URL.
 *
 * Anything else — `javascript:` above all — is rejected here rather than at render time,
 * because these values become `href`s on a public page. A protocol-relative `//evil.com`
 * is refused too: it looks like a path but leaves the site.
 */
const href = z
  .string()
  .trim()
  .max(500, "Link cannot exceed 500 characters")
  .refine(
    (value) =>
      /^\/(?!\/)/.test(value) || /^https?:\/\//i.test(value) || /^mailto:/i.test(value),
    "Enter a path like /register or a full https:// URL"
  );

const optionalHref = z
  .union([href, z.literal("")])
  .nullish()
  .transform((value) => value || null);

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------

export const homeSettingsSchema = z.object({
  brandLabel: requiredText(40, "Brand name"),

  heroBadge: optionalText(60, "Badge"),
  heroTitle: requiredText(160, "Headline"),
  heroSubtitle: optionalText(400, "Sub-heading"),
  heroPrimaryLabel: requiredText(40, "Primary button label"),
  heroPrimaryHref: href,
  heroSecondaryLabel: optionalText(40, "Secondary button label"),
  heroSecondaryHref: optionalHref,

  statsEnabled: z.boolean(),

  featuresEnabled: z.boolean(),
  featuresTitle: requiredText(120, "Features heading"),
  featuresSubtitle: optionalText(240, "Features sub-heading"),

  stepsEnabled: z.boolean(),
  stepsTitle: requiredText(120, "Steps heading"),
  stepsSubtitle: optionalText(240, "Steps sub-heading"),

  faqEnabled: z.boolean(),
  faqTitle: requiredText(120, "FAQ heading"),
  faqSubtitle: optionalText(240, "FAQ sub-heading"),

  ctaEnabled: z.boolean(),
  ctaTitle: requiredText(120, "Call-to-action heading"),
  ctaBody: optionalText(300, "Supporting line"),
  ctaButtonLabel: requiredText(40, "Call-to-action button label"),
  ctaButtonHref: href,

  footerTagline: optionalText(200, "Footer tagline"),

  metaTitle: optionalText(70, "Page title"),
  metaDescription: optionalText(200, "Meta description"),
});

/**
 * The editor saves one tab at a time, so every field is optional — but a field that IS
 * present still has to be valid, and `.strict()` rejects unknown keys instead of letting a
 * typo silently no-op.
 */
export const homeSettingsUpdateSchema = homeSettingsSchema
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, "Nothing to update");

// ---------------------------------------------------------------------------
// BLOCKS
// ---------------------------------------------------------------------------

export const homeBlockKindSchema = z.enum(["STAT", "FEATURE", "STEP", "FAQ", "LINK"]);
export const homeMetricSchema = z.enum([
  "MANUAL",
  "STUDENTS",
  "SUBJECTS",
  "QUESTIONS",
  "ATTEMPTS",
  "PASS_RATE",
  "AVERAGE_SCORE",
]);

const blockFields = z.object({
  title: requiredText(160, "Title"),
  body: optionalText(600, "Body text"),
  icon: z
    .union([z.enum(HOME_ICON_NAMES), z.literal("")])
    .nullish()
    .transform((value) => value || null),
  metric: homeMetricSchema.default("MANUAL"),
  value: optionalText(24, "Figure"),
  href: optionalHref,
  isActive: z.boolean().default(true),
});

/**
 * Which optional columns are actually required depends on the kind — the shared table can't
 * express that, so it is enforced here.
 */
function refineForKind(
  data: { kind?: string; metric?: string; value?: unknown; body?: unknown; href?: unknown },
  ctx: z.RefinementCtx,
  kind: string
) {
  if (kind === "STAT" && data.metric === "MANUAL" && !data.value) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message: "Enter the figure to display, or pick a live metric instead",
    });
  }

  if (kind === "FAQ" && !data.body) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["body"],
      message: "An FAQ entry needs an answer",
    });
  }

  if (kind === "LINK" && !data.href) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["href"],
      message: "A footer link needs a destination",
    });
  }
}

export const homeBlockCreateSchema = blockFields
  .extend({ kind: homeBlockKindSchema })
  .superRefine((data, ctx) => refineForKind(data, ctx, data.kind));

/**
 * `kind` is absent on purpose: a block cannot move between sections, because its meaningful
 * columns differ per kind and a moved row would carry the wrong ones. The kind comes from
 * the stored row, so the same per-kind rules still apply.
 */
export const homeBlockUpdateSchema = blockFields.partial().strict();

export function refineHomeBlockUpdate(kind: string) {
  return homeBlockUpdateSchema.superRefine((data, ctx) => {
    // A partial update only has to satisfy a rule when it touches the field that rule
    // guards — otherwise clearing an unrelated field would fail on an untouched column.
    if (kind === "STAT" && (data.metric !== undefined || data.value !== undefined)) {
      if (data.metric === "MANUAL" && !data.value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "Enter the figure to display, or pick a live metric instead",
        });
      }
    }
    if (kind === "FAQ" && data.body !== undefined && !data.body) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["body"], message: "An FAQ entry needs an answer" });
    }
    if (kind === "LINK" && data.href !== undefined && !data.href) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["href"], message: "A footer link needs a destination" });
    }
  });
}

export const homeBlockReorderSchema = z.object({
  kind: homeBlockKindSchema,
  ids: z.array(z.string().min(1)).min(1, "Provide the ordered block ids"),
});

export type HomeSettingsInput = z.infer<typeof homeSettingsSchema>;
export type HomeSettingsUpdateInput = z.infer<typeof homeSettingsUpdateSchema>;
export type HomeBlockCreateInput = z.infer<typeof homeBlockCreateSchema>;
export type HomeBlockUpdateInput = z.infer<typeof homeBlockUpdateSchema>;
