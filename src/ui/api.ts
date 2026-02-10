export interface FileItem {
  path: string;
  name: string;
  file?: File; // Only for web
}

export interface ConvertOptions {
  files: FileItem[];
  format: string;
  outputDir?: string;
}

export const isWeb = !('electronAPI' in window);

export const api = {
  selectFiles: async (): Promise<FileItem[]> => {
    if (!isWeb) {
      // @ts-ignore
      const paths = await window.electronAPI.selectFiles();
      return paths.map((p: string) => ({
        path: p,
        name: p.split(/[/\\]/).pop() || p
      }));
    } else {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        // Accept common image formats + PDF + HEIC
        input.accept = "image/*,.pdf,.heic";
        input.onchange = (e: any) => {
          const files = Array.from(e.target.files as File[]);
          resolve(files.map(f => ({
            path: f.name, // Use name as ID
            name: f.name,
            file: f
          })));
        };
        input.click();
      });
    }
  },

  convertFiles: async (options: ConvertOptions, onProgress?: (p: number) => void) => {
    if (!isWeb) {
      // Electron handles progress via IPC listener in App.tsx
      // @ts-ignore
      return window.electronAPI.convertFiles(
        options.files.map(f => f.path),
        options.format,
        options.outputDir
      );
    } else {
      // Web implementation
      const formData = new FormData();
      options.files.forEach(f => {
        if (f.file) formData.append('files', f.file);
      });
      formData.append('format', options.format);

      // Simulate progress (fake) since fetch doesn't support upload progress easily without XHR
      let p = 0;
      const interval = setInterval(() => {
          p += 10;
          if (p > 90) p = 90;
          if (onProgress) onProgress(p);
      }, 500);

      try {
        const res = await fetch('/api/convert', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        clearInterval(interval);
        if (onProgress) onProgress(100);

        if (data.success && data.files) {
            // Trigger downloads sequentially to avoid browser blocking
            for (const f of data.files) {
                const link = document.createElement('a');
                link.href = f.url;
                link.download = f.name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                await new Promise(r => setTimeout(r, 500));
            }
            return { completed: data.files.length, errors: 0 };
        } else {
            throw new Error(data.error || 'Conversion failed');
        }
      } catch (e) {
          clearInterval(interval);
          throw e;
      }
    }
  }
};
