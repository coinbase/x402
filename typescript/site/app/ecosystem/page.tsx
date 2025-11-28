import fs from 'fs';
import path from 'path';
import { categories, type Partner } from './data'; // Import categories and Partner type
import EcosystemClient from './ecosystem-client';
import Link from 'next/link';
import { ChevronLeftIcon } from '@heroicons/react/24/solid';
import NavBar from "../components/NavBar"; // Added import

async function getPartners(): Promise<Partner[]> {
  const partnersDirectory = path.join(process.cwd(), 'app/ecosystem/partners-data');
  let partnerFolders: string[] = [];

  try {
    partnerFolders = fs.readdirSync(partnersDirectory).filter(file => {
      // Validate filename to prevent path traversal
      if (!/^[a-zA-Z0-9_-]+$/.test(file)) {
        return false;
      }
      return fs.statSync(`${partnersDirectory}/${file}`).isDirectory();
    });
  } catch (error) {
    console.error("Error reading partners directory:", error);
    return []; // Return empty if directory doesn't exist or other error
  }

  const allPartnersData = partnerFolders.map((folder) => {
    // Sanitize folder name to prevent path traversal attacks - only allow alphanumeric, dash, underscore
    if (!/^[a-zA-Z0-9_-]+$/.test(folder)) {
      console.error("Invalid folder name detected:", folder);
      return null;
    }
    
    const metadataFilePath = `${partnersDirectory}/${folder}/metadata.json`;
    try {
      const fileContents = fs.readFileSync(metadataFilePath, 'utf8');
      const metadata = JSON.parse(fileContents) as Omit<Partner, 'slug'>;
      return { ...metadata, slug: folder, logoUrl: metadata.logoUrl || `/images/ecosystem/logos/${folder}.png` }; // Add slug and a default logo path convention
    } catch (error) {
      console.error("Error reading or parsing metadata.json for folder:", folder, error);
      return null;
    }
  });

  return allPartnersData.filter(partner => partner !== null) as Partner[];
}

interface EcosystemPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function EcosystemPage({ searchParams }: EcosystemPageProps) {
  const partners = await getPartners();
  const resolvedSearchParams = await searchParams;
  const selectedCategory = typeof resolvedSearchParams.category === 'string' ? resolvedSearchParams.category : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-800 to-black text-white relative overflow-hidden">
      <div className="relative z-10">
        <NavBar />
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Link href="/" className="mb-8 inline-flex items-center text-white hover:text-gray-300 transition-colors font-mono relative z-20">
            <ChevronLeftIcon className="w-5 h-5 mr-2" />
            Back to Main Page
          </Link>
          <EcosystemClient
            initialPartners={partners}
            categories={categories}
            initialSelectedCategory={selectedCategory}
          />
        </div>
      </div>
    </div>
  );
}

// Optional: Revalidate data at intervals if needed, though for filesystem reads it might be on every request in dev and at build time in prod.
// export const revalidate = 60; // Revalidate every 60 seconds 