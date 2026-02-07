import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  calculate: (operation: string, a: string, b: string): Promise<string> =>
    ipcRenderer.invoke("calculate", operation, a, b),

  windowMinimize: (): void => ipcRenderer.send("window-minimize"),
  windowClose: (): void => ipcRenderer.send("window-close"),

  checkBackendStatus: (): Promise<boolean> => ipcRenderer.invoke("check-backend-status"),
  checkBackendReady: (): Promise<boolean> => ipcRenderer.invoke("check-backend-ready"),
  installBackend: (): Promise<void> => ipcRenderer.invoke("install-backend"),
  onBackendLog: (callback: (log: string) => void): void => {
    ipcRenderer.on("backend-log", (_event, log) => callback(log));
  },
  onBackendReady: (callback: () => void): void => {
    ipcRenderer.on("backend-ready", () => callback());
  },
  onInstallComplete: (callback: () => void): void => {
    ipcRenderer.on("install-complete", () => callback());
  },
});

export interface ElectronAPI {
  calculate: (operation: string, a: string, b: string) => Promise<string>;
  windowMinimize: () => void;
  windowClose: () => void;
  checkBackendStatus: () => Promise<boolean>;
  checkBackendReady: () => Promise<boolean>;
  installBackend: () => Promise<void>;
  onBackendLog: (callback: (log: string) => void) => void;
  onBackendReady: (callback: () => void) => void;
  onInstallComplete: (callback: () => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
