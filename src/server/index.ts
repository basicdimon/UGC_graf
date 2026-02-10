import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync, createWriteStream } from 'fs';
import sharp from 'sharp';
import { exec } from 'child_process';
import util from 'util';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const heicConvert = require('heic-convert');
const PDFDocument = require('pdfkit');

const execAsync = util.promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Setup uploads/downloads dirs
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const DOWNLOAD_DIR = path.join(process.cwd(), 'downloads');

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
if (!existsSync(DOWNLOAD_DIR)) mkdirSync(DOWNLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({ storage });

// API Endpoints

// Upload and Convert
app.post('/api/convert', upload.array('files'), async (req, res) => {
    try {
        const files = req.files as Express.Multer.File[];
        const targetFormat = req.body.format || 'png';
        const convertedFiles: any[] = [];

        console.log(`Received ${files.length} files for conversion to ${targetFormat}`);

        for (const file of files) {
            const inputPath = file.path;
            const outputFilename = `${path.parse(file.originalname).name}.${targetFormat}`;
            const outputPath = path.join(DOWNLOAD_DIR, outputFilename);

            console.log(`Converting ${inputPath} -> ${outputPath}`);

            try {
                // Conversion Logic
                await convertFile(inputPath, outputPath, targetFormat);
                convertedFiles.push({ 
                    name: outputFilename, 
                    url: `/api/download/${outputFilename}` 
                });
            } catch (e) {
                console.error(`Error converting ${file.originalname}:`, e);
            } finally {
                // Cleanup input
                try { await fs.unlink(inputPath); } catch {}
            }
        }
        
        res.json({ success: true, files: convertedFiles });
    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/download/:filename', (req, res) => {
    const filePath = path.join(DOWNLOAD_DIR, req.params.filename);
    if (existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send('File not found');
    }
});

// Serve UI
app.use(express.static(path.join(process.cwd(), 'dist-ui')));

// Fallback to index.html
app.get('*', (req, res) => {
    const indexPath = path.join(process.cwd(), 'dist-ui/index.html');
    if (existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send('UI not built. Please run npm run build:ui');
    }
});

// Logic
async function convertFile(inputPath: string, outputPath: string, targetFormat: string) {
    const ext = path.extname(inputPath).toLowerCase();
    
    if (ext === '.pdf') {
        // PDF Handling (using ghostscript via exec)
        if (['jpg', 'jpeg', 'png', 'webp'].includes(targetFormat)) {
             // Use ghostscript
             // -sDEVICE=png16m or jpeg
             const device = targetFormat === 'jpg' || targetFormat === 'jpeg' ? 'jpeg' : 'png16m';
             // Ghostscript output format with %d for pages, but we only want first page for icon/preview style?
             // Or user expects all pages?
             // For simple converter, let's just do first page or single output if possible.
             // If we use -o output.png it produces single file (first page) or multiple if %d not used but multiple pages?
             // Actually -o output.png overwrites.
             
             await execAsync(`gs -dQUIET -dSAFER -dBATCH -dNOPAUSE -dNOPROMPT -sDEVICE=${device} -o "${outputPath}" -dFirstPage=1 -dLastPage=1 -r150 "${inputPath}"`);
        }
    } else if (ext === '.heic') {
        const inputBuffer = await fs.readFile(inputPath);
        const pngBuffer = await heicConvert({ buffer: inputBuffer, format: 'PNG' });
        
        if (targetFormat === 'png') {
            await fs.writeFile(outputPath, pngBuffer);
        } else {
             await sharp(pngBuffer).toFormat(targetFormat as any).toFile(outputPath);
        }
    } else {
        // Image to Image
        if (targetFormat === 'pdf') {
            // Image -> PDF
             const doc = new PDFDocument({ autoFirstPage: false });
             const writeStream = createWriteStream(outputPath);
             doc.pipe(writeStream);
             
             const metadata = await sharp(inputPath).metadata();
             doc.addPage({ size: [metadata.width!, metadata.height!] });
             doc.image(inputPath, 0, 0, { width: metadata.width, height: metadata.height });
             doc.end();
             
             await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
             });
        } else {
            // Image -> Image
            await sharp(inputPath).toFormat(targetFormat as any).toFile(outputPath);
        }
    }
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
