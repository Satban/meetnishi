#!/usr/bin/env node
// Generates 1200x630 Open Graph share cards for each page.
// Renders an on-brand HTML template with headless Chrome.
// Run: node scripts/build-og.mjs   (from repo root)

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'assets/og');
const tmpDir = resolve(root, '.og-build');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const logoPath = resolve(root, 'assets/nishi_logo.png');

const cards = [
  { slug: 'home',          eyebrow: 'Built for life on GLP-1', title: 'Your nutrition companion.',            sub: 'It connects your kitchen, your wearables, and how you feel.' },
  { slug: 'how-it-works',  eyebrow: 'How it works',            title: 'It notices. Then it helps.',           sub: 'Observation, action, outcome. Not another blank prompt.' },
  { slug: 'pricing',       eyebrow: 'Early access',            title: 'Free to start. Premium when it earns it.', sub: '7-day trial. No card. Free tier never expires.' },
  { slug: 'story',         eyebrow: 'Our story',               title: 'Why Nishi exists.',                    sub: 'Built for the question GLP-1 leaves behind: what do I eat now?' },
  { slug: 'faq',           eyebrow: 'FAQ',                     title: 'Questions, answered.',                 sub: 'What Nishi is, how privacy works, what Premium unlocks.' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const html = (c) => `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1200px; height:630px; }
  body {
    background:#FAF7F0; font-family:'Inter',sans-serif;
    padding:84px 90px; position:relative;
    display:flex; flex-direction:column; justify-content:space-between;
    overflow:hidden;
  }
  body::before { content:""; position:absolute; left:0; top:0; bottom:0; width:10px; background:#DD6C59; }
  .wordmark { font-family:'Inter',sans-serif; font-weight:700; font-size:42px; color:#DD6C59; letter-spacing:-0.5px; }
  .mid { margin-top:auto; margin-bottom:auto; max-width:1000px; }
  .eyebrow {
    display:inline-block; font-size:21px; font-weight:600; letter-spacing:2.4px;
    text-transform:uppercase; color:#C75A48; margin-bottom:26px;
  }
  h1 {
    font-family:'Fraunces',serif; font-weight:600; font-size:82px; line-height:1.08;
    letter-spacing:-1.2px; color:#2A2520; margin-bottom:26px;
  }
  .sub { font-size:31px; line-height:1.4; color:#6B6258; font-weight:400; max-width:880px; }
  .foot { font-size:22px; color:#94897C; font-weight:500; letter-spacing:0.3px; }
</style></head>
<body>
  <span class="wordmark">nishi</span>
  <div class="mid">
    <span class="eyebrow">${esc(c.eyebrow)}</span>
    <h1>${esc(c.title)}</h1>
    <div class="sub">${esc(c.sub)}</div>
  </div>
  <div class="foot">meetnishi.com</div>
</body></html>`;

if (!existsSync(chrome)) { console.error('Chrome not found at', chrome); process.exit(1); }
mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

for (const c of cards) {
  const htmlPath = resolve(tmpDir, `${c.slug}.html`);
  const pngPath = resolve(outDir, `${c.slug}.png`);
  writeFileSync(htmlPath, html(c));
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=1200,630',
    '--default-background-color=FAF7F0FF',
    '--virtual-time-budget=4000',
    '--run-all-compositor-stages-before-draw',
    `--screenshot=${pngPath}`,
    `file://${htmlPath}`,
  ], { stdio: 'ignore' });
  console.log('rendered', pngPath);
}

rmSync(tmpDir, { recursive: true, force: true });
console.log('done — ' + cards.length + ' cards in assets/og/');
