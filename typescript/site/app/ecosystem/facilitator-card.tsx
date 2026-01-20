'use client';

import { useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import { XMarkIcon } from '@heroicons/react/24/solid';
import type { Partner } from './data';

interface FacilitatorCardProps {
  partner: Partner;
  variant?: 'standard' | 'featured';
}

export default function FacilitatorCard({ partner, variant = 'standard' }: FacilitatorCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!partner.facilitator) {
    return null; // This shouldn't happen, but just in case
  }

  const { facilitator } = partner;
  const isFeatured = variant === 'featured';
  const tagLabel = partner.typeLabel ?? partner.category;
  const handleOpen = () => setIsModalOpen(true);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  };

  return (
    <>
      <article
        role="button"
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        className={`group relative w-full flex flex-col border border-foreground bg-background cursor-pointer outline-none transition-all duration-200 hover:bg-gray-10 hover:border-accent-orange hover:shadow-lg focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          isFeatured ? 'px-3 pt-4 pb-5' : 'px-4 pt-5 pb-6'
        }`}
      >
        <div className="absolute inset-x-0 top-0 h-[7px] bg-black group-hover:bg-accent-orange transition-colors duration-200" aria-hidden="true" />

        <div
          className={`relative z-20 flex items-start justify-between ${
            isFeatured ? 'mb-3' : 'mb-4'
          }`}
        >
          {partner.logoUrl ? (
            <div
              className={`overflow-hidden border border-foreground ${
                isFeatured ? 'h-[60px] w-[60px]' : 'h-[56px] w-[56px]'
              }`}
            >
              <Image
                src={partner.logoUrl}
                alt={`${partner.name} logo`}
                width={120}
                height={120}
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div
              className={`border border-foreground ${
                isFeatured ? 'h-[60px] w-[60px]' : 'h-[56px] w-[56px]'
              }`}
              aria-hidden="true"
            />
          )}

          <span className="rounded-sm bg-gray-10 px-2 py-1 text-xs font-medium text-foreground">
            {tagLabel}
          </span>
        </div>

        <div className="relative z-20 space-y-2">
          <h3
            className={`leading-snug ${
              isFeatured ? 'text-sm font-semibold uppercase' : 'text-base font-medium uppercase'
            }`}
          >
            {partner.name}
          </h3>
          <p
            className={`text-gray-60 leading-relaxed ${
              isFeatured ? 'text-xs' : 'text-sm'
            }`}
          >
            {partner.description}
          </p>
        </div>

        <div
          className={`relative z-20 font-medium ${
            isFeatured ? 'mt-3 text-xs' : 'mt-4 text-sm'
          }`}
        >
          <span className="inline-flex items-center gap-1 text-accent-orange">View details →</span>
        </div>
      </article>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Modal Content */}
          <div className="relative bg-gray-900 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <div className="flex items-center space-x-4">
                <div className="relative w-12 h-12">
                  <Image
                    src={partner.logoUrl}
                    alt={`${partner.name} logo`}
                    fill
                    sizes="48px"
                    style={{ objectFit: 'contain', borderRadius: '0.5rem' }}
                    className="bg-gray-700/[.5] p-1"
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white font-mono">{partner.name}</h2>
                  <p className="text-sm text-gray-400 font-mono">Facilitator</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Description */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-2 font-mono">Description</h3>
                <p className="text-gray-300 font-mono">{partner.description}</p>
              </div>

              {/* Base URL */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-2 font-mono">Base URL</h3>
                <a
                  href={facilitator.baseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 font-mono break-all"
                >
                  {facilitator.baseUrl}
                </a>
              </div>

              {/* Networks */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-3 font-mono">Supported Networks</h3>
                <div className="flex flex-wrap gap-2">
                  {facilitator.networks.map((network) => (
                    <span
                      key={network}
                      className="text-sm bg-gray-700 text-gray-300 px-3 py-1 rounded-full font-mono"
                    >
                      {network}
                    </span>
                  ))}
                </div>
              </div>

              {/* Schemes */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-3 font-mono">Payment Schemes</h3>
                <div className="flex flex-wrap gap-2">
                  {facilitator.schemes.map((scheme) => (
                    <span
                      key={scheme}
                      className="text-sm bg-green-700 text-green-200 px-3 py-1 rounded-full font-mono"
                    >
                      {scheme}
                    </span>
                  ))}
                </div>
              </div>

              {/* Assets */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-3 font-mono">Supported Assets</h3>
                <div className="flex flex-wrap gap-2">
                  {facilitator.assets.map((asset) => (
                    <span
                      key={asset}
                      className="text-sm bg-purple-700 text-purple-200 px-3 py-1 rounded-full font-mono"
                    >
                      {asset}
                    </span>
                  ))}
                </div>
              </div>

              {/* Capabilities */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-3 font-mono">Capabilities</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${facilitator.supports.verify ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-gray-300 font-mono">Verify Payments</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${facilitator.supports.settle ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-gray-300 font-mono">Settle Payments</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${facilitator.supports.supported ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-gray-300 font-mono">Supported Endpoint</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${facilitator.supports.list ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-gray-300 font-mono">List Resources</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end p-6 border-t border-gray-700">
              <a
                href={partner.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-mono transition-colors"
              >
                Visit Website
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
