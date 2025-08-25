import { Category, CategorySchema } from "./schemas";

export const categories: Category[] = [
  { id: "phones", slug: "phones", title: "Important Phones", description: "Emergency, taxi, services", title_el: "Σημαντικά Τηλέφωνα", description_el: "Έκτακτη ανάγκη, ταξί, υπηρεσίες", icon: "☎️", order: 1 },
  { id: "restaurants", slug: "restaurants", title: "Restaurants", description: "Our top recommendations", title_el: "Εστιατόρια", description_el: "Οι κορυφαίες προτάσεις μας", icon: "🍽️", order: 2 },
  { id: "sightseeing", slug: "sightseeing", title: "Sightseeing", description: "Must-see places", title_el: "Αξιοθέατα", description_el: "Μέρη που αξίζει να δείτε", icon: "📍", order: 3 },
].map((c) => CategorySchema.parse(c));
