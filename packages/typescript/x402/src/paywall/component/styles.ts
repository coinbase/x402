export function getComponentStyles(component: any) {
  const baseStyles = getBaseStyles();
  const themeStyles = getThemeStyles(component);

  return `
    ${baseStyles}
    ${themeStyles}
  `;
}

function getBaseStyles() {
  return `
    :host {
      display: block;
      --x402-primary-color: #2563eb;
      --x402-secondary-color: #059669;
      --x402-background-color: white;
      --x402-surface-color: #f9fafb;
      --x402-text-color: #111827;
      --x402-text-secondary: #4b5563;
      --x402-border-radius: 0.75rem;
      --x402-padding: 1.5rem;
      --x402-gap: 1rem;
      --x402-box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      --x402-font-family: system-ui, -apple-system, sans-serif;
      --x402-button-height: 2.5rem;
    }

    .container {
      max-width: 32rem;
      margin: 2rem auto;
      padding: var(--x402-padding);
      background-color: var(--x402-background-color);
      border-radius: var(--x402-border-radius);
      box-shadow: var(--x402-box-shadow);
      color: var(--x402-text-color);
      font-family: var(--x402-font-family);
    }

    /* More base styles... */
  `;
}

function getThemeStyles(component: any) {
  const mode = component.themeMode;
  const preset = component.themePreset;

  let themeStyles = "";

  // Apply theme mode (dark/light)
  if (mode === "dark") {
    themeStyles += `
      :host {
        --x402-background-color: #1e293b;
        --x402-surface-color: #334155;
        --x402-text-color: #f1f5f9;
        --x402-text-secondary: #cbd5e1;
      }
    `;
  }

  // Apply theme preset if specified
  if (preset === "minimal") {
    themeStyles += `
      :host {
        --x402-border-radius: 0.25rem;
        --x402-box-shadow: none;
        --x402-padding: 1rem;
      }
    `;
  } else if (preset === "rounded") {
    themeStyles += `
      :host {
        --x402-border-radius: 9999px;
        --x402-button-height: 3rem;
      }
    `;
  }

  return themeStyles;
}
