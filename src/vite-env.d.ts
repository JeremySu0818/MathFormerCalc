/// <reference types="vite/client" />

interface ElectronAPI {
  calculate: (operation: string, a: string, b: string) => Promise<string>;
  windowMinimize: () => void;
  windowClose: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
