'use client';

import Image from 'next/image';
import type { Partner } from './data';

interface PartnerCardProps {
  partner: Partner;
}

export default function PartnerCard({ partner }: PartnerCardProps) {
  return (
    <div className="flex flex-col bg-gray-800/[.4] hover:bg-gray-700/[.6] rounded-lg shadow-xl overflow-hidden transition-all duration-300 ease-in-out group p-6 border border-gray-700 hover:border-blue-500/70 h-full backdrop-blur-sm">
      <div className="flex items-start justify-between mb-4">
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
        <div className="flex-1 flex justify-center items-center px-4">
          <span className="inline-block bg-gray-700 text-blue-300 text-xs font-mono px-2 py-1 rounded-full whitespace-normal break-words max-w-[230px] text-center">
            {partner.category}
          </span>
        </div>
      </div>

      <h3 className="text-xl font-bold text-gray-100 group-hover:text-blue-400 mb-1 font-mono">
        {partner.name}
      </h3>
      <p className="text-sm text-gray-300 leading-relaxed flex-grow font-mono">
        {partner.description}
      </p>

      <div className="mt-4">
        <a
          href={partner.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 font-mono text-sm transition-colors"
        >
          Visit website →
        </a>
      </div>
    </div>
  );
} 