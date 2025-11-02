'use client';

import Image from 'next/image';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/solid';
import type { Partner } from './data';

interface PartnerCardProps {
  partner: Partner;
}

export default function PartnerCard({ partner }: PartnerCardProps) {
  return (
    <a
      href={partner.websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col bg-gray-800/[.4] hover:bg-gray-700/[.6] rounded-lg shadow-xl overflow-hidden transition-all duration-300 ease-in-out group border border-gray-700 hover:border-blue-500/70 h-full backdrop-blur-sm"
    >
      {/* Category Tag - Top Left */}
      <div className="flex justify-start pt-4 pb-4 pl-6">
        <span className="inline-block bg-gray-700/[.5] text-blue-300 text-xs font-mono px-2 py-1 rounded-full">
          {partner.category}
        </span>
      </div>

      <div className="px-6 pb-6 flex flex-col flex-grow">
        <div className="flex items-center mb-4">
          <div className="relative w-16 h-16 md:w-20 md:h-20 flex-shrink-0">
            <Image
              src={partner.logoUrl}
              alt={`${partner.name} logo`}
              fill
              sizes="(max-width: 768px) 64px, 80px"
              style={{ objectFit: 'contain', borderRadius: '0.5rem' }}
              className="transition-transform duration-300 group-hover:scale-105 bg-gray-700/[.5] p-1"
            />
          </div>
          <div className="ml-4 flex-1">
            <h3 className="text-xl font-bold text-gray-100 group-hover:text-blue-400 mb-1 font-mono">
              {partner.name}
            </h3>
          </div>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed flex-grow font-mono">
          {partner.description}
        </p>

        <div className="mt-4">
          <span className="text-blue-400 group-hover:text-blue-300 font-mono text-sm transition-colors flex items-center gap-1">
            Visit website
            <ArrowTopRightOnSquareIcon className="w-3 h-3" />
          </span>
        </div>
      </div>
    </a>
  );
}