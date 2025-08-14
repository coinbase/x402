import type { IpcMainEvent } from "electron";
import { app, ipcMain, BrowserWindow, Menu } from "electron";
import path from "path";
import { logger } from "./logger";
import { X402RequestParams } from "./src/utils/x402Client";

type BeforeSendHeadersDetails = {
  requestHeaders: Record<string, string | string[]>;
};

type HeadersReceivedDetails = {
  responseHeaders: Record<string, string | string[]>;
};

type BeforeSendHeadersCallback = (details: {
  requestHeaders: Record<string, string | string[]>;
}) => void;
type HeadersReceivedCallback = (details: {
  responseHeaders: Record<string, string | string[]>;
}) => void;

export interface DiscoveryListResponse {
  x402Version: number;
  items: Array<{
    type: string;
    resource: string;
    x402Version: number;
    accepts: Array<{
      scheme: "exact";
      description: string;
      network: "base-sepolia" | "base";
      maxAmountRequired: string;
      resource: string;
      mimeType: string;
      payTo: string;
      maxTimeoutSeconds: number;
      asset: string;
      outputSchema?: Record<string, unknown>;
      extra?: Record<string, unknown>;
    }>;
    lastUpdated: number;
    metadata?: Record<string, unknown>;
  }>;
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

let mainWindow: BrowserWindow | null = null;

// Platform-specific constants
const isMac = process.platform === "darwin";
const cmdOrCtrl = isMac ? "Command" : "Ctrl";

// Helper function for focused window operations
const withFocusedWindow = (callback: (window: BrowserWindow) => void) => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow) {
    callback(focusedWindow);
  }
};

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  if (process.platform != "darwin") app.quit();
});

/**
 * Creates the main application window with appropriate settings and menu configuration.
 * Sets up CORS handling and window event listeners.
 *
 * @returns {void}
 */
function createWindow() {
  logger.info("Creating window");
  mainWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(import.meta.dirname, "preload.js"), // Changed from .ts to .js
      webSecurity: false, // Disable web security for development
    },
  });

  // Disable CORS for all origins
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    (details: BeforeSendHeadersDetails, callback: BeforeSendHeadersCallback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          "Access-Control-Allow-Origin": "*",
        },
      });
    },
  );

  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details: HeadersReceivedDetails, callback: HeadersReceivedCallback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Access-Control-Allow-Origin": ["*"],
          "Access-Control-Allow-Headers": ["*"],
          "Access-Control-Allow-Methods": ["*"],
        },
      });
    },
  );

  if (!mainWindow) {
    throw new Error("Failed to create main window");
  }

  // Menu is basically just used to test IPC communication from main node process to renderer process
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        {
          click: () => mainWindow?.webContents.send("sign-message", "Hello, world!"),
          label: "Sign Message",
        },
        {
          type: "separator",
        },
        {
          label: "Quit",
          accelerator: `${cmdOrCtrl}+Q`,
          click: function () {
            app.quit();
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Undo",
          accelerator: `${cmdOrCtrl}+Z`,
          role: "undo",
        },
        {
          label: "Redo",
          accelerator: isMac ? "Shift+Command+Z" : "Ctrl+Y",
          role: "redo",
        },
        {
          type: "separator",
        },
        {
          label: "Cut",
          accelerator: `${cmdOrCtrl}+X`,
          role: "cut",
        },
        {
          label: "Copy",
          accelerator: `${cmdOrCtrl}+C`,
          role: "copy",
        },
        {
          label: "Paste",
          accelerator: `${cmdOrCtrl}+V`,
          role: "paste",
        },
        {
          label: "Select All",
          accelerator: `${cmdOrCtrl}+A`,
          role: "selectAll",
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          accelerator: `${cmdOrCtrl}+R`,
          click: function () {
            withFocusedWindow(focusedWindow => {
              focusedWindow.webContents.reloadIgnoringCache();
            });
          },
        },
        {
          label: "Toggle DevTools",
          accelerator: isMac ? "Alt+Command+I" : "Ctrl+Shift+I",
          click: function () {
            withFocusedWindow(focusedWindow => {
              focusedWindow.webContents.toggleDevTools();
            });
          },
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        {
          label: "Minimize",
          accelerator: `${cmdOrCtrl}+M`,
          role: "minimize",
        },
        {
          label: "Close",
          accelerator: `${cmdOrCtrl}+W`,
          role: "close",
        },
        ...(isMac
          ? [
              {
                type: "separator" as const,
              },
              {
                label: "Bring All to Front",
                role: "front" as const,
              },
            ]
          : []),
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  // Open DevTools in development
  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
    mainWindow.show();
    mainWindow.loadURL("http://localhost:3000");
  } else {
    mainWindow.loadFile(path.join(import.meta.dirname, "dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Launches the application, ensuring only a single instance is running.
 * Handles window creation, activation, and quit events.
 *
 * @returns {void}
 */
export function launchApp() {
  // Prevent multiple instances of the app
  var gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on("second-instance", () => {
      // Someone tried to run a second instance, we should focus our window.
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

    // Launch app on first instance
    app.whenReady().then(() => {
      if (!mainWindow) {
        createWindow();
      }

      // On macOS, re-create a window when dock icon is clicked
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        }
        mainWindow?.show();
      });
    });

    // Quit when all windows are closed, except on macOS
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });
  }
}

/**
 * Closes the application by closing the main window and quitting the app.
 *
 * @returns {void}
 */
export function closeApp() {
  if (mainWindow) {
    mainWindow.close();
  }
  app.quit();
}

/**
 * Focuses the application window, restoring it if minimized or creating it if not exists.
 *
 * @returns {void}
 */
export function focusApp() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    mainWindow.show();
  } else {
    launchApp();
  }
  mainWindow?.show();
}

export const operations = {
  signMessage: {
    title: "Sign Message",
    description: "Sign a message with the user's private key",
    tool: async (message: string): Promise<string> => {
      mainWindow?.webContents.send("sign-message", message);
      return new Promise(resolve => {
        ipcMain.once("sign-message-response", (_event: IpcMainEvent, signature: string) => {
          logger.info("sign-message-response from main", signature);
          resolve(signature);
        });
      });
    },
  },

  discoveryList: {
    title: "Discovery List",
    description: "Get list of available discovery items",
    tool: async (): Promise<DiscoveryListResponse> => {
      logger.info("discoveryList called");
      mainWindow?.webContents.send("discovery-list");
      return new Promise(resolve => {
        ipcMain.once(
          "discovery-list-response",
          (_event: IpcMainEvent, items: DiscoveryListResponse) => {
            logger.info("discovery-list-response from main", items);
            resolve(items);
          },
        );
      });
    },
  },

  makeX402Request: {
    title: "Make HTTP Request with X402 Payment",
    description: "Make an HTTP request to an X402-enabled endpoint, handling any required payments",
    tool: async (params: X402RequestParams): Promise<unknown> => {
      logger.info("makeX402Request called", params);
      mainWindow?.webContents.send("make-x402-request", params);
      return new Promise((resolve, reject) => {
        ipcMain.once(
          "make-x402-request-response",
          (_event: IpcMainEvent, result: { error?: string; data?: unknown }) => {
            logger.info("make-x402-request-response from main", result);
            if (result.error) {
              reject(new Error(result.error));
            } else {
              resolve(result);
            }
          },
        );
      });
    },
  },

  getWalletAddress: {
    title: "Get Wallet Address",
    description: "Get the user's wallet address",
    tool: async (): Promise<string> => {
      logger.info("getWalletAddress called");
      mainWindow?.webContents.send("get-wallet-address");
      return new Promise((resolve, reject) => {
        ipcMain.once(
          "get-wallet-address-response",
          (_event: IpcMainEvent, result: { error?: string; data?: string }) => {
            logger.info("get-wallet-address-response from main", result);
            if (result.error) {
              reject(new Error(result.error));
            } else if (result.data) {
              resolve(result.data);
            } else {
              reject(new Error("No wallet address received"));
            }
          },
        );
      });
    },
  },
};
