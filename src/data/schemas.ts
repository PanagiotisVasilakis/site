import { z } from "zod";
import { ICON_NAMES } from "@/components/icons/iconNames";

export const CategorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  title_en: z.string().optional(),
  title_el: z.string().optional(),
  description: z.string().optional(),
  description_en: z.string().optional(),
  description_el: z.string().optional(),
  icon: z.enum(ICON_NAMES).optional(),
  order: z.number().optional(),
});

export type Category = z.infer<typeof CategorySchema>;

// z.url() accepts every scheme, javascript: and data: included, and these fields are rendered as href attributes.
const httpUrl = z.url({ protocol: /^https?$/ });

/**
 * Where a guide photo comes from and under which licence it may be shown. Every third-party heroImage needs
 * one: the strict content gate (src/lib/data.ts, run by the build) fails without it, so a photo with no
 * recorded right cannot reach the site again, and the detail page prints it, which CC BY and CC BY-SA require.
 */
export const HeroImageCreditSchema = z.object({
  author: z.string().min(1),
  /** The licence as its source states it: "CC BY-SA 4.0", "CC0", "Public domain", "Own photo". */
  license: z.string().min(1),
  /** The page that shows the photo with its author and licence (for example the Wikimedia Commons file page). */
  sourceUrl: httpUrl,
  licenseUrl: httpUrl.optional(),
}).strict();

export type HeroImageCredit = z.infer<typeof HeroImageCreditSchema>;

/** Illustrations drawn for this site: no third party holds rights in them, so they need no credit. */
export const PROJECT_ARTWORK_HERO_IMAGES: ReadonlySet<string> = new Set(['/phones/sos-hero.webp']);

export const ItemSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  name: z.string(),
  name_en: z.string().optional(),
  name_el: z.string().optional(),
  summary: z.string().optional(),
  summary_en: z.string().optional(),
  summary_el: z.string().optional(),
  description: z.string().optional(),
  description_en: z.string().optional(),
  description_el: z.string().optional(),
  descriptionTitle: z.string().optional(),
  descriptionTitle_en: z.string().optional(),
  descriptionTitle_el: z.string().optional(),
  phone: z.string().optional(),
  phones: z.array(z.string()).optional(),
  address: z.string().optional(),
  address_en: z.string().optional(),
  address_el: z.string().optional(),
  location: z
    .object({ lat: z.number(), lng: z.number() })
    .optional(),
  website: httpUrl.optional(),
  directionsUrl: httpUrl.optional(),
  sourceUrls: z.array(httpUrl).optional(),
  tags: z.array(z.string()).optional(),
  image: z.string().optional(),
  heroImage: z.string().optional(),
  heroImagePosition: z.string().optional(),
  heroImageCredit: HeroImageCreditSchema.optional(),
  slug: z.string().optional(),
});

export type Item = z.infer<typeof ItemSchema>;
