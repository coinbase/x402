"use client";

import { useState } from "react";

interface CodeSnippetProps {
  code: string;
  title?: string;
  description?: string;
}

export function CodeSnippet({ code, title, description }: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-[663px] border-t-[7px] border-black">
      <div className="border border-t-0 border-black bg-white p-4">
        {title && (
          <div className="flex items-center gap-2 mb-4">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M10.1773 14.2771L14.027 10.4274L14.027 9.57256L10.1773 5.72284L11.1852 4.71494L15.4524 8.98216L15.4524 11.0178L11.1852 15.285L10.1773 14.2771Z"
                fill="black"
              />
              <path
                d="M4.54758 9.45634C4.54758 9.36899 4.64792 9.29819 4.77171 9.29819H14.0703C14.1941 9.29819 14.2945 9.36899 14.2945 9.45633V10.5633C14.2945 10.6507 14.1941 10.7215 14.0703 10.7215H4.77171C4.64792 10.7215 4.54758 10.6507 4.54758 10.5633V9.45634Z"
                fill="black"
              />
            </svg>
            <h3 className="font-mono text-lg font-semibold tracking-tight">
              {title}
            </h3>
          </div>
        )}

        <div className="flex justify-between items-start bg-[#F1F1F1] px-3 py-1.5 mb-4">
          <code className="font-mono text-sm tracking-tight whitespace-pre flex-1 min-w-0">{code}</code>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 bg-black text-white px-2 py-1 text-sm font-medium hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
            aria-label={copied ? "Copied to clipboard" : "Copy code"}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M4.76172 3.1001L15.2207 3.10107L16.915 4.79639L16.916 16.9019H15.2383L15.2373 16.8999H4.7793L3.08398 15.2056V3.09814H4.7627L4.76172 3.1001ZM4.7627 14.5093L5.47461 15.2212H15.2373L15.2383 5.4917L14.5254 4.77881H4.76172L4.7627 14.5093Z"
                fill="white"
              />
            </svg>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {description && (
          <p className="text-sm text-gray-60 font-mono leading-normal">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
