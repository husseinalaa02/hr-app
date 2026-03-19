import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { mkdirSync } from 'fs';

// SVG icon — blue gradient background with stylized "A" and people silhouette
const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0C447C"/>
      <stop offset="100%" style="stop-color:#1565c0"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.95"/>
      <stop offset="100%" style="stop-color:#e8f2fb;stop-opacity:0.9"/>
    </linearGradient>
  </defs>

  <!-- Background rounded rect -->
  <rect width="512" height="512" rx="100" ry="100" fill="url(#bg)"/>

  <!-- Subtle inner glow ring -->
  <rect x="16" y="16" width="480" height="480" rx="88" ry="88"
        fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

  <!-- People icon — center person (larger) -->
  <circle cx="256" cy="178" r="52" fill="url(#accent)"/>
  <path d="M148 340 C148 280 178 252 256 252 C334 252 364 280 364 340"
        fill="url(#accent)" stroke="none"/>

  <!-- People icon — left person (smaller) -->
  <circle cx="136" cy="198" r="36" fill="rgba(255,255,255,0.55)"/>
  <path d="M58 340 C58 298 82 276 136 276 C165 276 185 288 198 308"
        fill="rgba(255,255,255,0.45)" stroke="none"/>

  <!-- People icon — right person (smaller) -->
  <circle cx="376" cy="198" r="36" fill="rgba(255,255,255,0.55)"/>
  <path d="M314 308 C327 288 347 276 376 276 C430 276 454 298 454 340"
        fill="rgba(255,255,255,0.45)" stroke="none"/>

  <!-- Bottom bar — company initial strip -->
  <rect x="80" y="390" width="352" height="72" rx="16" fill="rgba(255,255,255,0.15)"/>

  <!-- "AA" text -->
  <text x="256" y="448" font-family="Arial Black, Arial, sans-serif"
        font-size="44" font-weight="900" fill="white" text-anchor="middle"
        letter-spacing="6">AFAQ</text>
</svg>
`;

mkdirSync('./public', { recursive: true });

await sharp(Buffer.from(svg))
  .resize(512, 512)
  .png()
  .toFile('./public/app-icon-512.png');

console.log('✓ Generated public/app-icon-512.png (512×512)');

// Also generate a 1024x1024 version
await sharp(Buffer.from(svg))
  .resize(1024, 1024)
  .png()
  .toFile('./public/app-icon-1024.png');

console.log('✓ Generated public/app-icon-1024.png (1024×1024)');
