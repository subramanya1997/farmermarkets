const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, 'public', 'leaf.png');
const publicDir = path.join(__dirname, 'public');

// Define the favicon sizes we need
const sizes = [
  { name: 'favicon.ico', size: 32 },
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 }
];

// Read the source image
const sourceBuffer = fs.readFileSync(sourcePath);

// Create all the favicon sizes
Promise.all(
  sizes.map(({ name, size }) => {
    const outputPath = path.join(publicDir, name);
    
    // For ICO files we need special handling
    if (name.endsWith('.ico')) {
      return sharp(sourceBuffer)
        .resize(size, size)
        .toFormat('png')
        .toBuffer()
        .then(data => {
          // For simplicity, we're creating a PNG and renaming it to .ico
          // In a production environment, you'd want to use a dedicated library for ICO files
          fs.writeFileSync(outputPath, data);
          console.log(`Created ${outputPath}`);
        });
    }
    
    // For PNG files
    return sharp(sourceBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath)
      .then(() => {
        console.log(`Created ${outputPath}`);
      });
  })
)
.then(() => {
  console.log('All favicon files created successfully!');
})
.catch(err => {
  console.error('Error creating favicon files:', err);
}); 