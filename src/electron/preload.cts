import { contextBridge, ipcRenderer } from 'electron';

console.log('Preload script loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  selectFiles: () => ipcRenderer.invoke('dialog:openFile'),
  selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  convertFiles: (files: string[], format: string, outputDir?: string) => ipcRenderer.invoke('app:convert', files, format, outputDir),
  onProgress: (callback: (data: { progress: number; currentFile: string }) => void) => 
    ipcRenderer.on('conversion:progress', (_event, data) => callback(data)),
  onConversionComplete: (callback: (summary: any) => void) => 
    ipcRenderer.on('conversion:complete', (_event, summary) => callback(summary)),
  onConversionError: (callback: (error: string) => void) => 
    ipcRenderer.on('conversion:error', (_event, error) => callback(error)),
  onPdfRenderRequest: (callback: (data: { id: string, buffer: Uint8Array }) => void) => 
    ipcRenderer.on('pdf:render-request', (_event, data) => callback(data)),
  sendPdfRendered: (id: string, data: string | null, error?: string) => 
    ipcRenderer.invoke('pdf:rendered', { id, data, error }),
});
