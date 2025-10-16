'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type Partner, type CategoryInfo } from './data'; // Partner and CategoryInfo types
import PartnerCard from './partner-card';
import FacilitatorCard from './facilitator-card';
import { BackgroundVideo } from '../components/BackgroundVideo'; // Adjusted import path

interface EcosystemClientProps {
  initialPartners: Partner[];
  categories: CategoryInfo[];
  initialSelectedCategory?: string | null;
}

export default function EcosystemClient({ initialPartners, categories, initialSelectedCategory }: EcosystemClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialSelectedCategory || null);

  // Update URL when category changes
  const updateCategory = (categoryId: string | null) => {
    setSelectedCategory(categoryId);

    const params = new URLSearchParams(searchParams.toString());
    if (categoryId) {
      params.set('category', categoryId);
    } else {
      params.delete('category');
    }

    const newUrl = params.toString() ? `?${params.toString()}` : '';
    router.push(`/ecosystem${newUrl}`, { scroll: false });
  };

  const filteredPartners = useMemo(() => {
    if (!selectedCategory) {
      return initialPartners;
    }
    return initialPartners.filter((partner) => {
      // The category in metadata.json is the category *name*. We need to find its ID for comparison.
      const partnerCategoryInfo = categories.find(cat => cat.name === partner.category);
      return partnerCategoryInfo?.id === selectedCategory;
    });
  }, [selectedCategory, initialPartners, categories]);

  const mainCategoriesFilter = useMemo(() => [
    { id: null, name: 'All Projects' },
    ...categories.map(c => ({ id: c.id, name: c.name }))
  ], [categories]);

  return (
    <>
      {/* Video Background */}
      <div className="fixed w-full z-0">
        <div className="fixed w-full bg-gradient-to-t from-black" /> {/* Optional: overlay for video */}
        <BackgroundVideo src="/neonblobs.mp4" />
      </div>

      <div className="relative z-10">
        <main className="max-w-6xl mx-auto px-4 py-12 md:py-20 lg:px-12">
          <section className="text-center mb-12 md:mb-16">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 font-mono">
              Explore the <span className="text-blue-400">x402 Ecosystem</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto font-mono">
              Discover innovative projects, tools, and applications built by our growing community of partners and developers leveraging x402 technology.
            </p>
          </section>

          <section className="mb-10 md:mb-12">
            <div className="flex flex-wrap justify-center gap-3 md:gap-4">
              {mainCategoriesFilter.map((category) => (
                <button
                  key={category.id || 'all'}
                  onClick={() => updateCategory(category.id)}
                  className={`
                    px-6 py-3 rounded-lg text-sm font-mono transition-all duration-200 ease-in-out 
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
                    ${selectedCategory === category.id || (selectedCategory === null && category.id === null)
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-700/[.5] text-gray-300 hover:bg-blue-700/[.4] hover:text-white'
                    }
                  `}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </section>

          <section>
            {filteredPartners.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {filteredPartners.map((partner) => (
                  // Render FacilitatorCard for facilitators, PartnerCard for others
                  partner.facilitator ? (
                    <FacilitatorCard key={partner.slug || partner.name} partner={partner} />
                  ) : (
                    <PartnerCard key={partner.slug || partner.name} partner={partner} />
                  )
                ))}
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-xl text-gray-500">No partners found for this category or matching your filter.</p>
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
} 