const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, func) => {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
    once: (channel, func) => {
      ipcRenderer.once(channel, (event, ...args) => func(...args));
    },
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  },
  OnSignMessage: callback =>
    ipcRenderer.on("sign-message", (_event, message) => {
      callback(message).then(signature => {
        console.log("sign-message-response", signature);
        ipcRenderer.send("sign-message-response", signature);
      });
    }),

  OnDiscoveryList: callback =>
    ipcRenderer.on("discovery-list", _event => {
      callback().then(items => {
        console.log("discovery-list-response", items);
        ipcRenderer.send("discovery-list-response", items);
      });
    }),

  OnMakeX402Request: callback =>
    ipcRenderer.on("make-x402-request", (_event, params) => {
      callback(params)
        .then(result => {
          console.log("make-x402-request-response", result);
          ipcRenderer.send("make-x402-request-response", result);
        })
        .catch(error => {
          console.error("make-x402-request-error", error);
          ipcRenderer.send("make-x402-request-response", { error: error.message });
        });
    }),

  OnGetWalletAddress: callback =>
    ipcRenderer.on("get-wallet-address", _event => {
      callback()
        .then(address => {
          console.log("get-wallet-address-response", address);
          ipcRenderer.send("get-wallet-address-response", address);
        })
        .catch(error => {
          console.error("get-wallet-address-error", error);
          ipcRenderer.send("get-wallet-address-response", { error: error.message });
        });
    }),
});
