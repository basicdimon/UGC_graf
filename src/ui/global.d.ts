export interface ElectronAPI {
  getVersion: () => Promise<string>;
  selectFiles: () => Promise<string[]>;
  selectDirectory: () => Promise<string | null>;
  convertFiles: (files: string[], format: string, outputDir?: string) => Promise<void>;
  onProgress: (callback: (data: { progress: number; currentFile: string }) => void) => void;
  onConversionComplete: (callback: (summary: any) => void) => void;
  onConversionError: (callback: (error: string) => void) => void;
  onPdfRenderRequest: (callback: (data: { id: string, buffer: Uint8Array }) => void) => void;
  sendPdfRendered: (id: string, data: string | null, error?: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
