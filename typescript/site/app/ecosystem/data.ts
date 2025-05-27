export interface Partner {
  name: string;
  description: string;
  logoUrl: string; // Path to the logo, e.g., /images/ecosystem/logos/project-logo.png
  websiteUrl: string;
  category: string; // Main category name as defined in categories array
  // Additional fields like a slug for directory name can be added if needed for linking or lookup
  slug?: string;
}

export interface CategoryInfo {
  id: string; // e.g., "client-side-integrations"
  name: string; // e.g., "Client-Side Integrations"
}

// These categories will be used for filtering and can be referenced in partner metadata.json
export const categories: CategoryInfo[] = [
  {
    id: "client-side-integrations",
    name: "Client-Side Integrations",
  },
  {
    id: "services-endpoints",
    name: "Services/Endpoints",
  },
  {
    id: "ecosystem-infrastructure",
    name: "Ecosystem Infrastructure & Tooling",
  },
  {
    id: "learning-community",
    name: "Learning & Community Resources",
  },
];

// The partners array is removed from here. It will be dynamically loaded.
