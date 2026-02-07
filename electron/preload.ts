import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  calculate: (operation: string, a: string, b: string): Promise<string> =>
    ipcRenderer.invoke("calculate", operation, a, b),

  windowMinimize: (): void => ipcRenderer.send("window-minimize"),
  windowClose: (): void => ipcRenderer.send("window-close"),

  checkBackendStatus: (): Promise<boolean> => ipcRenderer.invoke("check-backend-status"),
  installBackend: (): Promise<void> => ipcRenderer.invoke("install-backend"),
  onBackendLog: (callback: (log: string) => void): void => {
    ipcRenderer.on("backend-log", (_event, log) => callback(log));
  },
});

export interface ElectronAPI {
  calculate: (operation: string, a: string, b: string) => Promise<string>;
  windowMinimize: () => void;
  windowClose: () => void;
  checkBackendStatus: () => Promise<boolean>;
  installBackend: () => Promise<void>;
  onBackendLog: (callback: (log: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
