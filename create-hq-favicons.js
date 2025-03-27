const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'public', 'leaf-hq.svg');
const publicDir = path.join(__dirname, 'public');

// First convert SVG to a high-quality PNG
async function createHighQualityPNG() {
  // Read the SVG file
  const svgBuffer = fs.readFileSync(svgPath);
  
  // Create a high-quality PNG at 1024px (this will be our source for favicons)
  await sharp(svgBuffer)
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'leaf-hq.png'));
  
  console.log('Created high-quality PNG from SVG');
  
  // Now create favicons from the high-quality PNG
  await createFavicons();
}

// Define the favicon sizes we need
async function createFavicons() {
  const pngPath = path.join(publicDir, 'leaf-hq.png');
  const pngBuffer = fs.readFileSync(pngPath);
  
  const sizes = [
    { name: 'favicon.ico', size: 32 },
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'android-chrome-512x512.png', size: 512 }
  ];

  // Create all the favicon sizes with high quality settings
  await Promise.all(
    sizes.map(async ({ name, size }) => {
      const outputPath = path.join(publicDir, name);
      
      // For ICO files
      if (name.endsWith('.ico')) {
        await sharp(pngBuffer)
          .resize(size, size, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png({ quality: 100 })
          .toBuffer()
          .then(data => {
            fs.writeFileSync(outputPath, data);
            console.log(`Created ${outputPath}`);
          });
        return;
      }
      
      // For PNG files
      await sharp(pngBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png({ quality: 100 })
        .toFile(outputPath);
      
      console.log(`Created ${outputPath}`);
    })
  );
  
  console.log('All high-quality favicon files created successfully!');
}

// Run the main function
createHighQualityPNG().catch(err => {
  console.error('Error creating high-quality images:', err);
}); 