import { Category, CategorySchema } from "./schemas";

export const categories: Category[] = [
  { id: "phones", slug: "phones", title: "Important phones", description: "Emergency and local services in Kalamata.", title_el: "Χρήσιμα τηλέφωνα", description_el: "Αριθμοί έκτακτης ανάγκης και τοπικές υπηρεσίες στην Καλαμάτα.", icon: "phone", order: 1 },
  { id: "moments", slug: "moments", title: "Kalamata guide", description: "Museums, beaches, local food, historic sites and day trips, closest first.", title_el: "Οδηγός Καλαμάτας", description_el: "Μουσεία, παραλίες, τοπικές γεύσεις, ιστορικά μέρη και εκδρομές, πρώτα τα πιο κοντινά.", icon: "fork", order: 2 },
].map((c) => CategorySchema.parse(c));
