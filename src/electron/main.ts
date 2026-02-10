import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import sharp from 'sharp';
import fs from 'fs/promises';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const heicConvert = require('heic-convert');
const PDFDocument = require('pdfkit');
import fsOld from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.argv.includes('--squirrel-install') || process.argv.includes('--squirrel-updated')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs');
  console.log('Preload path:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: "Универсальный Графический Конвертер",
    titleBarStyle: 'hidden', // Modern look with custom titlebar
    titleBarOverlay: {
      color: '#0f172a', // Match bg-slate-900
      symbolColor: '#e2e8f0',
      height: 40
    },
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Explicitly disable sandbox to avoid issues
    },
    backgroundColor: '#0f172a',
    show: false, // Don't show until ready-to-show
  });

  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist-ui/index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Renderer finished loading');
  });

  mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('Preload Error:', error);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return [];
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (canceled) {
    return [];
  } else {
    return filePaths;
  }
});

ipcMain.handle('dialog:openDirectory', async () => {
  if (!mainWindow) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

const pendingPdfRequests = new Map<string, { resolve: (data: string | null) => void, reject: (err: any) => void }>();

ipcMain.handle('pdf:rendered', (_event, { id, data, error }) => {
  const request = pendingPdfRequests.get(id);
  if (request) {
    if (error) request.reject(new Error(error));
    else request.resolve(data);
    pendingPdfRequests.delete(id);
  }
});

ipcMain.handle('app:convert', async (event, files: string[], targetFormat: string, outputDir?: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;

  console.log(`Starting conversion of ${files.length} files to ${targetFormat} in ${outputDir || 'source directory'}`);
  let completed = 0;
  let errors = 0;
  const errorLog: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    try {
      window.webContents.send('conversion:progress', {
        progress: Math.round((i / files.length) * 100),
        currentFile: filePath
      });

      const dir = outputDir || path.dirname(filePath);
      const ext = path.extname(filePath);
      const name = path.basename(filePath, ext);
      const outputName = `${name}_converted.${targetFormat}`; // Add suffix to avoid overwrite
      const outputPath = path.join(dir, outputName);

      console.log(`Converting ${filePath} -> ${outputPath}`);

      // Determine input buffer (handle HEIC or read file)
      let pipeline;
      if (ext.toLowerCase() === '.pdf') {
        console.log('Detected PDF file, requesting render from renderer...');
        const inputBuffer = await fs.readFile(filePath);
        const requestId = crypto.randomUUID();
        
        const renderPromise = new Promise<string | null>((resolve, reject) => {
           pendingPdfRequests.set(requestId, { resolve, reject });
        });
        
        // Timeout safety
        setTimeout(() => {
            if (pendingPdfRequests.has(requestId)) {
                pendingPdfRequests.get(requestId)?.reject(new Error('PDF render timeout'));
                pendingPdfRequests.delete(requestId);
            }
        }, 30000);

        window.webContents.send('pdf:render-request', { id: requestId, buffer: inputBuffer });
        
        const dataUrl = await renderPromise;
        if (!dataUrl) throw new Error('PDF render returned no data');
        
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
        const imgBuffer = Buffer.from(base64Data, 'base64');
        pipeline = sharp(imgBuffer);
      } else if (ext.toLowerCase() === '.heic') {
        console.log('Detected HEIC file, using heic-convert...');
        const inputBuffer = await fs.readFile(filePath);
        const pngBuffer = await heicConvert({
          buffer: inputBuffer,
          format: 'PNG'
        });
        pipeline = sharp(pngBuffer);
      } else {
        pipeline = sharp(filePath);
      }

      // Handle PDF conversion specially
      if (targetFormat === 'pdf') {
         const doc = new PDFDocument({ autoFirstPage: false });
         const writeStream = fsOld.createWriteStream(outputPath);
         doc.pipe(writeStream);

         // Convert image to JPEG buffer for PDF embedding (reliable and smaller)
         const imgBuffer = await pipeline.jpeg().toBuffer();
         const metadata = await pipeline.metadata();

         doc.addPage({ size: [metadata.width!, metadata.height!] });
         doc.image(imgBuffer, 0, 0, { width: metadata.width, height: metadata.height });
         doc.end();

         await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
         });
      } else {
        // Standard sharp conversion for other formats
        await pipeline
          .toFormat(targetFormat as any)
          .toFile(outputPath);
      }

      completed++;
    } catch (err: any) {
      console.error(`Failed to convert ${filePath}:`, err);
      const errorMessage = `Failed to convert ${path.basename(filePath)}: ${err.message}`;
      window.webContents.send('conversion:error', errorMessage);
      errorLog.push(errorMessage);
      errors++;
    }
  }
  
  window.webContents.send('conversion:progress', {
        progress: 100,
        currentFile: 'Done'
  });

  window.webContents.send('conversion:complete', {
    total: files.length,
    completed,
    errors,
    errorLog
  });
});
