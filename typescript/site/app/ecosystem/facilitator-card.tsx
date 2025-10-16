'use client';

import { useState } from 'react';
import Image from 'next/image';
import { XMarkIcon } from '@heroicons/react/24/solid';
import type { Partner } from './data';

interface FacilitatorCardProps {
  partner: Partner;
}

export default function FacilitatorCard({ partner }: FacilitatorCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!partner.facilitator) {
    return null; // This shouldn't happen, but just in case
  }

  const { facilitator } = partner;

  return (
    <>
      {/* Card */}
      <div className="flex flex-col bg-gray-800/[.4] hover:bg-gray-700/[.6] rounded-lg shadow-xl overflow-hidden transition-all duration-300 ease-in-out group p-6 border border-gray-700 hover:border-blue-500/70 h-full backdrop-blur-sm font-mono">
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
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-blue-400 hover:text-blue-300 font-mono text-sm transition-colors"
          >
            View details →
          </button>
        </div>
      </div>

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
