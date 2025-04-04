export function setupProperties(component: any) {
  Object.defineProperties(component, {
    amount: {
      get() {
        return this.getAttribute("amount") || "0.00";
      },
      set(value) {
        this.setAttribute("amount", value);
      },
    },

    address: {
      get() {
        return this.getAttribute("address") || "";
      },
      set(value) {
        this.setAttribute("address", value);
      },
    },

    description: {
      get() {
        return this.getAttribute("description") || "Access to content";
      },
      set(value) {
        this.setAttribute("description", value);
      },
    },

    testnet: {
      get() {
        return this.hasAttribute("testnet") && this.getAttribute("testnet") !== "false";
      },
      set(value) {
        if (value) {
          this.setAttribute("testnet", "");
        } else {
          this.removeAttribute("testnet");
        }
      },
    },

    themeMode: {
      get() {
        return this.getAttribute("theme-mode") || "light";
      },
      set(value) {
        this.setAttribute("theme-mode", value);
      },
    },

    themePreset: {
      get() {
        return this.getAttribute("theme-preset") || "";
      },
      set(value) {
        this.setAttribute("theme-preset", value);
      },
    },

    // Add more properties as needed
  });
}
