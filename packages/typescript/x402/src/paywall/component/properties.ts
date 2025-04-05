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

    payToAddress: {
      get(): `0x${string}` {
        return this.getAttribute("payToAddress") as `0x${string}`;
      },
      set(value: `0x${string}`) {
        this.setAttribute("payToAddress", value);
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
  });
}
