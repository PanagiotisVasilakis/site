"use client";
import SearchBar from "@/components/SearchBar";
import CategoryChips from "@/components/CategoryChips";
import { useState } from "react";

interface SearchLabels { where: string; addLocation: string; dates: string; addDates: string; guestsLabel: string; guestSingular: string; guestPlural: string; search: string; }
interface Props {
  categories: Array<{ id: string; slug: string; title: string; icon?: string }>;
  labels?: SearchLabels;
}

export default function HomeInteractiveBar({ categories, labels }: Props) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4 -mt-6 mb-10">
  <SearchBar labels={labels} />
  <CategoryChips categories={categories} active={active} onChange={setActive} />
    </div>
  );
}
