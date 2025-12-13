"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { AnimatedGrid, AnimatedCard } from "@/lib/animations";
import { EcosystemCard } from "../components/EcosystemCard";
import FacilitatorCard from "./facilitator-card";
import type { Partner, CategoryInfo } from "./data";

interface EcosystemClientProps {
  initialPartners: Partner[];
  categories: CategoryInfo[];
  initialSelectedCategory?: string | null;
}

type PartitionResult = {
  featured: Partner[];
  byCategory: Record<string, Partner[]>;
};

function FolderIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/images/icons/folder.svg"
      alt=""
      width={20}
      height={20}
      className={className}
    />
  );
}

function IndentArrowIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/images/icons/indent_group5.svg"
      alt=""
      width={20}
      height={20}
      className={className}
    />
  );
}

function partitionPartners(partners: Partner[], categories: CategoryInfo[]): PartitionResult {
  const byCategory: Record<string, Partner[]> = { everything: [...partners] };

  // Initialize empty arrays for each category id
  for (const category of categories) {
    byCategory[category.id] = [];
  }

  // Create a map from category name to category id for lookup
  const nameToId = new Map(categories.map((c) => [c.name, c.id]));

  for (const partner of partners) {
    // Partner.category contains the display name (e.g., "Facilitators")
    // We need to map it to the category id (e.g., "facilitators")
    const categoryId = nameToId.get(partner.category);
    if (categoryId && byCategory[categoryId]) {
      byCategory[categoryId].push(partner);
    }
  }

  const featured = partners.filter((partner) => partner.featured);

  return { featured, byCategory };
}

export default function EcosystemClient({
  initialPartners,
  categories,
  initialSelectedCategory,
}: EcosystemClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [isExpanded, setIsExpanded] = useState(true);

  const activeFilter =
    (searchParams.get("filter") ?? initialSelectedCategory ?? "everything") || "everything";

  const { featured, byCategory } = useMemo(
    () => partitionPartners(initialPartners, categories),
    [initialPartners, categories],
  );

  const handleFilterChange = (categoryId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (categoryId === "everything") {
      params.delete("filter");
    } else {
      params.set("filter", categoryId);
    }
    router.push(`/ecosystem${params.toString() ? `?${params.toString()}` : ""}`, {
      scroll: false,
    });
  };

  const filteredPartners =
    activeFilter === "everything"
      ? initialPartners.filter((partner) => !partner.featured)
      : (byCategory[activeFilter] ?? []).filter((partner) => !partner.featured);

  return (
    <div className="mx-auto max-w-container px-6 py-16 sm:px-10">
      {/* Hero */}
      <section className="relative mb-16">
        <div className="pointer-events-none absolute left-[350px] top-[25px] z-0 h-[509px] w-[514px] opacity-30">
          <Image
            src="/images/ecosystem-halftone.svg"
            alt=""
            width={514}
            height={550}
            className="h-full w-full"
            priority
          />
        </div>

        <div className="relative z-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-4">
              <h1 className="font-display text-7xl tracking-tight">Ecosystem</h1>
            </div>
            <p className="max-w-[400px] text-right font-code-ui text-base leading-relaxed text-gray-60 sm:text-lg">
              Discover innovative projects, tools, and applications built by our growing community
              of partners and developers leveraging x402 technology.
            </p>
          </div>

          {featured.length > 0 && (
            <div className="mt-[107px] space-y-3">
              <p className="text-sm font-medium leading-5">Featured projects</p>
              <AnimatedGrid className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
                {featured.slice(0, 4).map((partner) => (
                  <AnimatedCard
                    key={partner.slug ?? partner.name}
                    layoutId={`featured-${partner.slug ?? partner.name}`}
                  >
                    {partner.facilitator ? (
                      <FacilitatorCard partner={partner} variant="featured" />
                    ) : (
                      <EcosystemCard partner={partner} variant="featured" />
                    )}
                  </AnimatedCard>
                ))}
              </AnimatedGrid>
            </div>
          )}
        </div>
      </section>

      {/* Sidebar + main content */}
      <section className="flex flex-col gap-12 lg:flex-row">
        <aside
          className="w-full text-sm lg:w-48 xl:w-56"
          aria-label="Ecosystem categories"
        >
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mb-2 flex w-full cursor-pointer items-center gap-2 py-1 text-left"
            aria-expanded={isExpanded}
          >
            <FolderIcon className="h-7 w-7 shrink-0" />
            <span className="font-mono text-sm font-medium tracking-[-0.28px]">Ecosystem</span>
          </button>

          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.nav
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="flex flex-col gap-0.5 overflow-hidden pl-2"
              >
                {[
                  { id: "everything", name: "Everything" },
                  ...categories.map((category) => ({ id: category.id, name: category.name })),
                ].map((category) => {
                  const isActive = activeFilter === category.id;
                  return (
                    <button
                      key={category.id}
                      onClick={() => handleFilterChange(category.id)}
                      className={`relative flex w-full cursor-pointer items-center gap-1.5 py-1.5 text-left font-mono text-sm font-medium tracking-[-0.28px] transition-colors ${
                        isActive ? "text-foreground" : "text-foreground/30 hover:text-foreground/60"
                      }`}
                    >
                      <IndentArrowIcon className="h-4 w-4 shrink-0" />
                      <span>{category.name}</span>
                    </button>
                  );
                })}
              </motion.nav>
            )}
          </AnimatePresence>
        </aside>

        <div className="flex-1 space-y-16">
          <AnimatePresence mode="wait">
            {activeFilter === "everything" ? (
              <motion.div
                key="everything"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="space-y-16"
              >
                {categories.map((category) => {
                  const partners = (byCategory[category.id] ?? []).filter(
                    (partner) => !partner.featured,
                  );
                  if (!partners.length) return null;

                  return (
                    <section
                      key={category.id}
                      id={category.id}
                      aria-labelledby={`${category.id}-heading`}
                      className="scroll-mt-24 space-y-4"
                    >
                      <h2 id={`${category.id}-heading`} className="font-['Helvetica_Neue',sans-serif] text-lg font-medium">
                        {category.name}
                      </h2>

                      <AnimatedGrid className="grid gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
                        {partners.map((partner) => (
                          <AnimatedCard
                            key={partner.slug ?? partner.name}
                            layoutId={`${partner.slug ?? partner.name}-${category.id}`}
                          >
                            {partner.facilitator ? (
                              <FacilitatorCard partner={partner} />
                            ) : (
                              <EcosystemCard partner={partner} />
                            )}
                          </AnimatedCard>
                        ))}
                      </AnimatedGrid>
                    </section>
                  );
                })}
              </motion.div>
            ) : (
              <motion.div
                key={activeFilter}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                <section className="scroll-mt-24 space-y-4">
                  <h2 className="font-['Helvetica_Neue',sans-serif] text-lg font-medium">
                    {categories.find((category) => category.id === activeFilter)?.name ??
                      "Ecosystem"}
                  </h2>
                  {filteredPartners.length > 0 ? (
                    <AnimatedGrid className="grid gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
                      {filteredPartners.map((partner) => (
                        <AnimatedCard
                          key={partner.slug ?? partner.name}
                          layoutId={`${partner.slug ?? partner.name}-${activeFilter}`}
                        >
                          {partner.facilitator ? (
                            <FacilitatorCard partner={partner} />
                          ) : (
                            <EcosystemCard partner={partner} />
                          )}
                        </AnimatedCard>
                      ))}
                    </AnimatedGrid>
                  ) : (
                    <p className="text-sm text-gray-60">No projects in this category yet.</p>
                  )}
                </section>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </section>
    </div>
  );
}
