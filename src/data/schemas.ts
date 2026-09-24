import { z } from "zod";

export const CategorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  title_en: z.string().optional(),
  title_el: z.string().optional(),
  description: z.string().optional(),
  description_en: z.string().optional(),
  description_el: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().optional(),
});

export type Category = z.infer<typeof CategorySchema>;

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
  website: z.string().url().optional(),
  directionsUrl: z.string().url().optional(),
  reservationUrl: z.string().url().optional(),
  sourceUrls: z.array(z.string().url()).optional(),
  rating: z.number().min(0).max(5).optional(),
  tags: z.array(z.string()).optional(),
  icon: z.string().optional(),
  image: z.string().optional(),
  heroImage: z.string().optional(),
  heroImagePosition: z.string().optional(),
  featured: z.boolean().optional(),
  slug: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type Item = z.infer<typeof ItemSchema>;
