import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  calculate: (operation: string, a: string, b: string): Promise<string> =>
    ipcRenderer.invoke("calculate", operation, a, b),

  windowMinimize: (): void => ipcRenderer.send("window-minimize"),
  windowClose: (): void => ipcRenderer.send("window-close"),
});

export interface ElectronAPI {
  calculate: (operation: string, a: string, b: string) => Promise<string>;
  windowMinimize: () => void;
  windowClose: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
