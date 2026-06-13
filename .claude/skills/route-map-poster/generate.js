#!/usr/bin/env node
/*
 * route-map-poster — generate an illustrated itinerary/route map poster.
 *
 * Usage:  node generate.js <spec.json> [output.png]
 *
 * Renders a real map base (CARTO/OpenStreetMap tiles) with numbered hand-drawn
 * attraction icons, a dashed route line, and a grouped legend. Output is a PNG.
 *
 * See SKILL.md for the spec schema and the list of built-in icons.
 */
const fs = require('fs');
const path = require('path');
let sharp;
try { sharp = require('sharp'); }
catch (e) {
  console.error('Missing dependency "sharp". Run:  npm install sharp   (inside the skill directory)');
  process.exit(1);
}

const TILE = 512; // @2x tiles
const FONT = process.env.POSTER_FONT || 'WenQuanYi Zen Hei, Noto Sans CJK SC, sans-serif';
const INK = '#2b2b2b';

// ---------- web mercator ----------
const lon2px = (lon, z) => (lon + 180) / 360 * Math.pow(2, z) * TILE;
const lat2px = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z) * TILE; };

// ---------- line-art icon library ----------
function icon(type, cx, cy, R, col) {
  const sw = (R * 0.17).toFixed(2);
  const o = `fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  const L = (x1, y1, x2, y2) => `<line x1="${(cx + x1 * R).toFixed(1)}" y1="${(cy + y1 * R).toFixed(1)}" x2="${(cx + x2 * R).toFixed(1)}" y2="${(cy + y2 * R).toFixed(1)}" ${o}/>`;
  const C = (x, y, r) => `<circle cx="${(cx + x * R).toFixed(1)}" cy="${(cy + y * R).toFixed(1)}" r="${(r * R).toFixed(1)}" ${o}/>`;
  const Pp = d => `<path d="${d}" ${o}/>`;
  const pt = (x, y) => `${(cx + x * R).toFixed(1)} ${(cy + y * R).toFixed(1)}`;
  switch (type) {
    case 'beach': return C(0,-0.32,0.3)+L(0,-0.85,0,-0.7)+L(0.65,-0.32,0.5,-0.32)+L(-0.65,-0.32,-0.5,-0.32)+L(0.42,-0.72,0.34,-0.62)+L(-0.42,-0.72,-0.34,-0.62)+Pp(`M ${pt(-0.75,0.5)} Q ${pt(-0.45,0.25)} ${pt(-0.15,0.5)} Q ${pt(0.15,0.75)} ${pt(0.45,0.5)} Q ${pt(0.6,0.38)} ${pt(0.75,0.5)}`);
    case 'sun': return C(0,0,0.4)+[0,1,2,3,4,5,6,7].map(i=>{const a=i*Math.PI/4;return L(0.55*Math.cos(a),0.55*Math.sin(a),0.8*Math.cos(a),0.8*Math.sin(a));}).join('');
    case 'wave': return Pp(`M ${pt(-0.8,-0.2)} Q ${pt(-0.5,-0.5)} ${pt(-0.2,-0.2)} Q ${pt(0.1,0.1)} ${pt(0.4,-0.2)} Q ${pt(0.6,-0.4)} ${pt(0.8,-0.2)}`)+Pp(`M ${pt(-0.8,0.4)} Q ${pt(-0.5,0.1)} ${pt(-0.2,0.4)} Q ${pt(0.1,0.7)} ${pt(0.4,0.4)} Q ${pt(0.6,0.2)} ${pt(0.8,0.4)}`);
    case 'pagoda': return L(0,-0.95,0,-0.78)+Pp(`M ${pt(-0.5,-0.4)} L ${pt(0,-0.78)} L ${pt(0.5,-0.4)}`)+Pp(`M ${pt(-0.68,0.0)} L ${pt(0,-0.38)} L ${pt(0.68,0.0)}`)+Pp(`M ${pt(-0.32,0.0)} L ${pt(-0.32,0.6)} L ${pt(0.32,0.6)} L ${pt(0.32,0.0)}`)+L(0,0.0,0,0.6);
    case 'wheel': return C(0,-0.05,0.62)+C(0,-0.05,0.08)+L(0,-0.05,0,-0.67)+L(0,-0.05,0,0.57)+L(0,-0.05,0.6,-0.05)+L(0,-0.05,-0.6,-0.05)+L(0,-0.05,0.42,-0.49)+L(0,-0.05,-0.42,-0.49)+L(0,-0.05,0.42,0.39)+L(0,-0.05,-0.42,0.39)+Pp(`M ${pt(-0.3,0.85)} L ${pt(0,0.55)} L ${pt(0.3,0.85)}`)+L(-0.45,0.85,0.45,0.85);
    case 'art': return Pp(`M ${pt(-0.6,-0.55)} L ${pt(0.6,-0.55)} L ${pt(0.6,0.55)} L ${pt(-0.6,0.55)} Z`)+C(-0.28,-0.22,0.13)+Pp(`M ${pt(-0.55,0.45)} L ${pt(-0.15,-0.05)} L ${pt(0.1,0.25)} L ${pt(0.35,-0.1)} L ${pt(0.55,0.45)}`);
    case 'museum': return Pp(`M ${pt(-0.65,-0.2)} L ${pt(0,-0.6)} L ${pt(0.65,-0.2)} Z`)+L(-0.6,-0.05,0.6,-0.05)+L(-0.4,-0.05,-0.4,0.5)+L(0,-0.05,0,0.5)+L(0.4,-0.05,0.4,0.5)+L(-0.65,0.6,0.65,0.6);
    case 'bag': return Pp(`M ${pt(-0.45,-0.2)} L ${pt(-0.55,0.6)} L ${pt(0.55,0.6)} L ${pt(0.45,-0.2)} Z`)+Pp(`M ${pt(-0.28,-0.2)} Q ${pt(-0.28,-0.62)} ${pt(0,-0.62)} Q ${pt(0.28,-0.62)} ${pt(0.28,-0.2)}`);
    case 'market': return Pp(`M ${pt(-0.6,-0.1)} L ${pt(0.6,-0.1)} L ${pt(0.45,0.6)} L ${pt(-0.45,0.6)} Z`)+Pp(`M ${pt(-0.6,-0.1)} L ${pt(-0.45,-0.45)} L ${pt(0.45,-0.45)} L ${pt(0.6,-0.1)}`)+L(-0.2,-0.1,-0.2,0.6)+L(0.2,-0.1,0.2,0.6);
    case 'star': { let p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5;const rr=i%2?0.4:0.85;p.push(pt(rr*Math.cos(a),rr*Math.sin(a)));}return Pp('M '+p.join(' L ')+' Z'); }
    case 'heart': return Pp(`M ${pt(0,0.6)} C ${pt(-0.9,-0.1)} ${pt(-0.5,-0.75)} ${pt(0,-0.3)} C ${pt(0.5,-0.75)} ${pt(0.9,-0.1)} ${pt(0,0.6)} Z`);
    case 'tree': return C(0,-0.25,0.45)+C(-0.32,0.05,0.3)+C(0.32,0.05,0.3)+L(0,0.2,0,0.7)+L(-0.25,0.7,0.25,0.7);
    case 'flower': return C(0,0,0.18)+[0,1,2,3,4].map(i=>{const a=-Math.PI/2+i*2*Math.PI/5;return C(0.42*Math.cos(a),0.42*Math.sin(a),0.22);}).join('');
    case 'mountain': return Pp(`M ${pt(-0.8,0.5)} L ${pt(-0.25,-0.5)} L ${pt(0.1,0.05)} L ${pt(0.4,-0.35)} L ${pt(0.8,0.5)} Z`)+Pp(`M ${pt(-0.45,-0.05)} L ${pt(-0.25,-0.5)} L ${pt(-0.05,-0.15)}`);
    case 'waterfall': return Pp(`M ${pt(-0.6,-0.6)} L ${pt(-0.6,0.2)}`)+Pp(`M ${pt(-0.2,-0.6)} L ${pt(-0.2,0.2)}`)+Pp(`M ${pt(0.2,-0.6)} L ${pt(0.2,0.2)}`)+Pp(`M ${pt(0.6,-0.6)} L ${pt(0.6,0.2)}`)+Pp(`M ${pt(-0.8,0.45)} Q ${pt(-0.4,0.25)} ${pt(0,0.45)} Q ${pt(0.4,0.65)} ${pt(0.8,0.45)}`);
    case 'beer': return Pp(`M ${pt(-0.38,-0.2)} L ${pt(-0.38,0.55)} L ${pt(0.25,0.55)} L ${pt(0.25,-0.2)}`)+Pp(`M ${pt(0.25,-0.05)} Q ${pt(0.6,-0.05)} ${pt(0.6,0.2)} Q ${pt(0.6,0.4)} ${pt(0.25,0.4)}`)+Pp(`M ${pt(-0.42,-0.2)} Q ${pt(-0.3,-0.5)} ${pt(-0.1,-0.32)} Q ${pt(0.08,-0.55)} ${pt(0.28,-0.32)} Q ${pt(0.4,-0.45)} ${pt(0.3,-0.2)}`);
    case 'coffee': return Pp(`M ${pt(-0.45,-0.25)} L ${pt(-0.4,0.4)} Q ${pt(-0.35,0.6)} ${pt(0,0.6)} Q ${pt(0.35,0.6)} ${pt(0.4,0.4)} L ${pt(0.45,-0.25)} Z`)+Pp(`M ${pt(0.45,-0.1)} Q ${pt(0.75,-0.1)} ${pt(0.7,0.15)} Q ${pt(0.65,0.3)} ${pt(0.42,0.3)}`)+L(-0.25,-0.55,-0.25,-0.4)+L(0.05,-0.6,0.05,-0.42);
    case 'food': return C(0,0,0.62)+C(0,0,0.32)+L(-0.78,-0.55,-0.78,0.0)+L(-0.62,-0.55,-0.62,0.0)+L(-0.7,0.0,-0.7,0.6);
    case 'camera': return Pp(`M ${pt(-0.65,-0.3)} L ${pt(-0.4,-0.3)} L ${pt(-0.28,-0.5)} L ${pt(0.28,-0.5)} L ${pt(0.4,-0.3)} L ${pt(0.65,-0.3)} L ${pt(0.65,0.5)} L ${pt(-0.65,0.5)} Z`)+C(0,0.05,0.27);
    case 'ferry': return Pp(`M ${pt(-0.7,0.15)} L ${pt(0.7,0.15)} L ${pt(0.5,0.55)} L ${pt(-0.5,0.55)} Z`)+Pp(`M ${pt(-0.5,0.15)} L ${pt(-0.5,-0.2)} L ${pt(0.4,-0.2)} L ${pt(0.5,0.15)}`)+L(-0.2,-0.2,-0.2,-0.5)+L(-0.2,-0.5,0.2,-0.35)+L(-0.2,-0.35,0.2,-0.35);
    case 'plane': return Pp(`M ${pt(0,-0.75)} Q ${pt(0.12,-0.75)} ${pt(0.12,-0.4)} L ${pt(0.12,-0.1)} L ${pt(0.7,0.25)} L ${pt(0.7,0.4)} L ${pt(0.12,0.2)} L ${pt(0.12,0.5)} L ${pt(0.3,0.65)} L ${pt(0.3,0.75)} L ${pt(0,0.65)} L ${pt(-0.3,0.75)} L ${pt(-0.3,0.65)} L ${pt(-0.12,0.5)} L ${pt(-0.12,0.2)} L ${pt(-0.7,0.4)} L ${pt(-0.7,0.25)} L ${pt(-0.12,-0.1)} L ${pt(-0.12,-0.4)} Q ${pt(-0.12,-0.75)} ${pt(0,-0.75)} Z`);
    case 'car': return Pp(`M ${pt(-0.7,0.2)} L ${pt(-0.55,-0.1)} Q ${pt(-0.45,-0.35)} ${pt(-0.2,-0.35)} L ${pt(0.2,-0.35)} Q ${pt(0.45,-0.35)} ${pt(0.55,-0.1)} L ${pt(0.7,0.2)} L ${pt(0.7,0.45)} L ${pt(-0.7,0.45)} Z`)+C(-0.4,0.45,0.16)+C(0.4,0.45,0.16);
    case 'hotel': return Pp(`M ${pt(-0.6,0.6)} L ${pt(-0.6,-0.55)} L ${pt(0.6,-0.55)} L ${pt(0.6,0.6)}`)+L(-0.6,0.6,0.6,0.6)+[-0.3,0.1].map(yy=>[-0.32,0.04].map(xx=>C(xx,yy,0.1)).join('')).join('')+Pp(`M ${pt(-0.18,0.6)} L ${pt(-0.18,0.3)} L ${pt(0.18,0.3)} L ${pt(0.18,0.6)}`);
    case 'building': return Pp(`M ${pt(-0.55,0.6)} L ${pt(-0.55,-0.6)} L ${pt(0.55,-0.6)} L ${pt(0.55,0.6)}`)+L(-0.55,0.6,0.55,0.6)+[-0.4,-0.1,0.2].map(yy=>[-0.32,0,0.32].map(xx=>C(xx,yy,0.09)).join('')).join('');
    case 'church': return L(0,-0.95,0,-0.55)+L(-0.18,-0.78,0.18,-0.78)+Pp(`M ${pt(-0.45,-0.1)} L ${pt(0,-0.55)} L ${pt(0.45,-0.1)} L ${pt(0.45,0.6)} L ${pt(-0.45,0.6)} Z`)+Pp(`M ${pt(-0.12,0.6)} L ${pt(-0.12,0.2)} Q ${pt(0,0.05)} ${pt(0.12,0.2)} L ${pt(0.12,0.6)}`);
    case 'castle': return Pp(`M ${pt(-0.6,-0.35)} L ${pt(-0.6,-0.6)} L ${pt(-0.4,-0.6)} L ${pt(-0.4,-0.45)} L ${pt(-0.2,-0.45)} L ${pt(-0.2,-0.6)} L ${pt(0.2,-0.6)} L ${pt(0.2,-0.45)} L ${pt(0.4,-0.45)} L ${pt(0.4,-0.6)} L ${pt(0.6,-0.6)} L ${pt(0.6,-0.35)} L ${pt(0.6,0.6)} L ${pt(-0.6,0.6)} Z`)+Pp(`M ${pt(-0.15,0.6)} L ${pt(-0.15,0.15)} Q ${pt(0,-0.05)} ${pt(0.15,0.15)} L ${pt(0.15,0.6)}`);
    case 'bridge': return L(-0.85,0.25,0.85,0.25)+Pp(`M ${pt(-0.8,0.25)} L ${pt(-0.4,-0.45)} L ${pt(0,0.25)}`)+Pp(`M ${pt(0,0.25)} L ${pt(0.4,-0.45)} L ${pt(0.8,0.25)}`)+L(-0.55,0.0,-0.55,0.25)+L(-0.25,0.05,-0.25,0.25)+L(0.25,0.05,0.25,0.25)+L(0.55,0.0,0.55,0.25)+L(-0.8,0.25,-0.8,0.6)+L(0.8,0.25,0.8,0.6);
    case 'paw': return C(0,0.25,0.38)+C(-0.45,-0.2,0.17)+C(-0.15,-0.45,0.17)+C(0.15,-0.45,0.17)+C(0.45,-0.2,0.17);
    case 'pin': default: return Pp(`M ${pt(0,0.7)} C ${pt(-0.6,0.0)} ${pt(-0.55,-0.7)} ${pt(0,-0.7)} C ${pt(0.55,-0.7)} ${pt(0.6,0.0)} ${pt(0,0.7)} Z`)+C(0,-0.25,0.2);
  }
}

// ---------- tiles ----------
async function getTile(style, z, x, y) {
  const base = style === 'voyager' ? 'rastertiles/voyager' : (style === 'dark' ? 'dark_all' : 'light_all');
  const url = `https://basemaps.cartocdn.com/${base}/${z}/${x}/${y}@2x.png`;
  for (let a = 0; a < 5; a++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': 'route-map-poster/1.0' } }); if (r.ok) return Buffer.from(await r.arrayBuffer()); }
    catch (e) {}
    await new Promise(r => setTimeout(r, 400 * (a + 1)));
  }
  throw new Error('tile fetch failed ' + z + '/' + x + '/' + y);
}

// ---------- main ----------
(async () => {
  const specPath = process.argv[2];
  if (!specPath) { console.error('Usage: node generate.js <spec.json> [output.png]'); process.exit(1); }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const out = process.argv[3] || spec.output || 'poster.png';
  const stops = spec.stops;
  if (!stops || !stops.length) { console.error('spec.stops is empty'); process.exit(1); }
  const groups = spec.groups && spec.groups.length ? spec.groups : [{ id: stops[0].group || 'A', label: spec.title || 'Route', color: '#2f6df0' }];
  const gById = Object.fromEntries(groups.map(g => [g.id, g]));
  const colorOf = s => (gById[s.group] && gById[s.group].color) || '#2f6df0';
  const lighten = hex => { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; const m = c => Math.round(c + (255 - c) * 0.82); return `rgb(${m(r)},${m(g)},${m(b)})`; };

  // bbox + padding
  const lats = stops.map(s => s.lat), lngs = stops.map(s => s.lng);
  let latMin = Math.min(...lats), latMax = Math.max(...lats), lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
  const padLat = Math.max((latMax - latMin) * 0.18, 0.0018), padLng = Math.max((lngMax - lngMin) * 0.18, 0.0022);
  const latN = latMax + padLat, latS = latMin - padLat, lngW = lngMin - padLng, lngE = lngMax + padLng;

  // auto zoom
  let Z = spec.zoom;
  if (!Z) {
    Z = 11;
    for (let z = 18; z >= 11; z--) {
      const txc = Math.floor(lon2px(lngE, z) / TILE) - Math.floor(lon2px(lngW, z) / TILE) + 1;
      const tyc = Math.floor(lat2px(latS, z) / TILE) - Math.floor(lat2px(latN, z) / TILE) + 1;
      if (txc <= 7 && tyc <= 10) { Z = z; break; }
    }
  }
  const pxL = lon2px(lngW, Z), pxR = lon2px(lngE, Z), pxT = lat2px(latN, Z), pxB = lat2px(latS, Z);
  const tx0 = Math.floor(pxL / TILE), tx1 = Math.floor(pxR / TILE), ty0 = Math.floor(pxT / TILE), ty1 = Math.floor(pxB / TILE);

  const style = spec.basemap || 'light';
  const comp = [];
  for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) comp.push({ input: await getTile(style, Z, x, y), left: (x - tx0) * TILE, top: (y - ty0) * TILE });
  const stitched = await sharp({ create: { width: (tx1 - tx0 + 1) * TILE, height: (ty1 - ty0 + 1) * TILE, channels: 4, background: '#fff' } }).composite(comp).png().toBuffer();
  const cropL = Math.round(pxL - tx0 * TILE), cropT = Math.round(pxT - ty0 * TILE), cw = Math.round(pxR - pxL), ch = Math.round(pxB - pxT);
  const mapBuf = await sharp(stitched).extract({ left: cropL, top: cropT, width: cw, height: ch }).png().toBuffer();
  const mapB64 = 'data:image/png;base64,' + mapBuf.toString('base64');

  // layout
  const PW = 1240, MARGIN = 20, dispW = PW - 2 * MARGIN, scale = dispW / cw, dispH = Math.round(ch * scale);
  const HEAD = spec.subtitle ? 150 : 120, mapTop = HEAD + 12, mapBottom = mapTop + dispH;
  const proj = s => ({ x: MARGIN + (lon2px(s.lng, Z) - pxL) * scale, y: mapTop + (lat2px(s.lat, Z) - pxT) * scale });
  const P = Object.fromEntries(stops.map(s => [s.n, proj(s)]));
  const G = groups.length;
  const colGap = 40, colMargin = 60, colW = (PW - 2 * colMargin - (G - 1) * colGap) / G;
  const rowH = 72, maxItems = Math.max(...groups.map(g => stops.filter(s => s.group === g.id).length));
  const cardTop = mapBottom + 24, cardH = 52 + 18 + maxItems * rowH + 8, PH = cardTop + cardH + 56;
  const nameFont = G >= 3 ? 21 : 24;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}" font-family="${FONT}">`;
  svg += `<rect width="${PW}" height="${PH}" fill="${spec.paper || '#fdf9f1'}"/>`;
  svg += `<rect x="0" y="0" width="${PW}" height="${HEAD}" fill="${spec.bannerColor || '#ffce2e'}"/><rect x="0" y="${HEAD}" width="${PW}" height="7" fill="#222"/>`;
  svg += `<text x="${PW / 2}" y="${spec.subtitle ? 72 : 78}" text-anchor="middle" font-size="52" font-weight="bold" fill="#222">${esc(spec.title || 'Route Map')}</text>`;
  if (spec.subtitle) svg += `<text x="${PW / 2}" y="120" text-anchor="middle" font-size="28" fill="#444">${esc(spec.subtitle)}</text>`;
  svg += `<image href="${mapB64}" x="${MARGIN}" y="${mapTop}" width="${dispW}" height="${dispH}"/>`;
  svg += `<rect x="${MARGIN}" y="${mapTop}" width="${dispW}" height="${dispH}" fill="none" stroke="#d8d2c4" stroke-width="2" rx="6"/>`;

  // route
  const order = spec.route && spec.route.length ? spec.route : stops.map(s => s.n);
  const dpath = order.filter(n => P[n]).map((n, i) => (i ? 'L' : 'M') + P[n].x.toFixed(1) + ' ' + P[n].y.toFixed(1)).join(' ');
  if (order.length > 1) svg += `<path d="${dpath}" fill="none" stroke="${spec.routeColor || '#ff8a1e'}" stroke-width="5" stroke-dasharray="2 11" stroke-linecap="round" opacity="0.95"/>`;

  // markers
  const lngMid = (lngW + lngE) / 2;
  stops.forEach(s => {
    const p = P[s.n], c = colorOf(s), R = 27;
    svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${R}" fill="#fff" stroke="${c}" stroke-width="4"/>`;
    svg += icon(s.icon || 'pin', p.x, p.y, R * 0.62, c);
    svg += `<circle cx="${(p.x - R * 0.72).toFixed(1)}" cy="${(p.y - R * 0.72).toFixed(1)}" r="13" fill="${c}"/>`;
    svg += `<text x="${(p.x - R * 0.72).toFixed(1)}" y="${(p.y - R * 0.72 + 5).toFixed(1)}" text-anchor="middle" font-size="17" font-weight="bold" fill="#fff">${s.n}</text>`;
    const nm = s.name || '', en = s.en || '';
    const tw = Math.max(nm.length * 22, en.length * 10) + 14;
    let left = s.lng < lngMid, lx = left ? p.x - R - 8 : p.x + R + 8, hx = left ? lx - tw + 8 : lx - 8;
    if (left && hx < MARGIN + 4) { left = false; lx = p.x + R + 8; hx = lx - 8; }
    else if (!left && hx + tw > PW - MARGIN - 4) { left = true; lx = p.x - R - 8; hx = lx - tw + 8; }
    const anchor = left ? 'end' : 'start';
    const lh = en ? 42 : 26;
    svg += `<rect x="${hx.toFixed(1)}" y="${(p.y - 22).toFixed(1)}" width="${tw}" height="${lh}" rx="7" fill="#fff" opacity="0.82"/>`;
    svg += `<text x="${lx.toFixed(1)}" y="${(p.y - 2).toFixed(1)}" text-anchor="${anchor}" font-size="21" font-weight="bold" fill="${INK}">${esc(nm)}</text>`;
    if (en) svg += `<text x="${lx.toFixed(1)}" y="${(p.y + 16).toFixed(1)}" text-anchor="${anchor}" font-size="14" fill="#666">${esc(en)}</text>`;
  });

  // legend cards
  groups.forEach((g, gi) => {
    const x = colMargin + gi * (colW + colGap), c = g.color, light = lighten(c);
    svg += `<rect x="${x}" y="${cardTop}" width="${colW}" height="52" rx="12" fill="${c}"/>`;
    svg += `<text x="${x + 22}" y="${cardTop + 36}" font-size="26" font-weight="bold" fill="#fff">${esc(g.label)}</text>`;
    let y = cardTop + 52 + 18 + 34;
    stops.filter(s => s.group === g.id).forEach(s => {
      const bx = x + 38, by = y;
      svg += `<circle cx="${bx}" cy="${by}" r="30" fill="#fff" stroke="${c}" stroke-width="3"/>`;
      svg += icon(s.icon || 'pin', bx, by, 18, c);
      svg += `<circle cx="${bx - 21}" cy="${by - 21}" r="13" fill="${c}"/>`;
      svg += `<text x="${bx - 21}" y="${by - 16}" text-anchor="middle" font-size="16" font-weight="bold" fill="#fff">${s.n}</text>`;
      svg += `<text x="${x + 86}" y="${by - 4}" font-size="${nameFont}" font-weight="bold" fill="${INK}">${esc(s.name || '')}</text>`;
      if (s.desc) svg += `<text x="${x + 86}" y="${by + 22}" font-size="17" fill="#7b8290">${esc(s.desc)}</text>`;
      y += rowH;
    });
  });
  svg += `<text x="${PW / 2}" y="${PH - 22}" text-anchor="middle" font-size="20" fill="#9aa3af">${esc(spec.footer || '底图 © OpenStreetMap / CARTO')}</text>`;
  svg += `</svg>`;

  fs.writeFileSync(out.replace(/\.png$/, '.svg'), svg);
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(out);
  console.log('Wrote', out, `(${PW}x${PH}, zoom ${Z}, ${comp.length} tiles)`);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(1); });

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
