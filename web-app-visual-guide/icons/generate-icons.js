/**
 * Run with: node generate-icons.js
 * Generates icon PNG files using Canvas API (requires canvas npm package)
 * OR: open generate-icons.html in a browser to generate and download the PNGs
 */

const sizes = [16, 48, 128];
const { createCanvas } = require('canvas');
const fs = require('fs');

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawIcon(ctx, size);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`icon${size}.png`, buffer);
  console.log(`Generated icon${size}.png`);
});

function drawIcon(ctx, size) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.45;

  // Background circle - Google Blue
  ctx.fillStyle = '#4285F4';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // White border circle
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = s * 0.06;
  ctx.beginPath();
  ctx.arc(cx, cy, r - s * 0.03, 0, Math.PI * 2);
  ctx.stroke();

  // "?" mark in white
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${s * 0.45}px Arial`;
  ctx.fillText('?', cx, cy + s * 0.02);
}
