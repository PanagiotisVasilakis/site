import { Category, CategorySchema } from "./schemas";

export const categories: Category[] = [
  { id: "phones", slug: "phones", title: "Important Phones", description: "", title_el: "Σημαντικά Τηλέφωνα", description_el: "", icon: "☎️", order: 1 },
  { id: "moments", slug: "moments", title: "Kalamata Moments", description: "Our top recommendations", title_el: "Η Καλαματα μας", description_el: "Οι κορυφαίες προτάσεις μας", icon: "🍽️", order: 2 },
].map((c) => CategorySchema.parse(c));
