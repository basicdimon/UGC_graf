import sharp from 'sharp';

console.log('Sharp version:', sharp.version);
console.log('Supported formats:', sharp.format);
// Check specific formats
const formats = ['heic', 'heif', 'avif', 'jpeg', 'png', 'webp', 'tiff'];
formats.forEach(f => {
    try {
        const hasSupport = sharp.format[f]?.input;
        console.log(`Format ${f} support: ${hasSupport ? 'YES' : 'NO'}`);
    } catch (e) {
        console.log(`Error checking ${f}:`, e.message);
    }
});
