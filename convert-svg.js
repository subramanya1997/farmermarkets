const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'public', 'leaf.svg');
const pngPath = path.join(__dirname, 'public', 'leaf.png');

// Read the SVG file
const svgBuffer = fs.readFileSync(svgPath);

// Convert SVG to PNG
sharp(svgBuffer)
  .png()
  .toFile(pngPath)
  .then(() => {
    console.log(`Successfully converted ${svgPath} to ${pngPath}`);
  })
  .catch(err => {
    console.error('Error converting SVG to PNG:', err);
  }); 