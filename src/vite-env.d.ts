/// <reference types="vite/client" />

interface ElectronAPI {
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

export { };
