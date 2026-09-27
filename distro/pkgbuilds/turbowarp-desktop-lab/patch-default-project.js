// SPDX-License-Identifier: GPL-3.0-or-later
// Swap TurboWarp's default sprite for the Scratch Cat (as in vanilla Scratch 3).
// Usage: node patch-default-project.js <extracted app.asar dir> <dir with cat assets>
// Fails loudly if the minified code no longer matches, so version bumps can't silently skip it.
'use strict';
const fs = require('fs');
const path = require('path');

const [appDir, assetDir] = process.argv.slice(2);
const file = path.join(appDir, 'dist-renderer-webpack/editor/gui/index.js');
let js = fs.readFileSync(file, 'utf8');

const OLD = '927d672925e7b99f7813735c484c6922';
const CAT_A = 'bcf454acf82e4504149f7ffe07081dbc';
const CAT_B = '0fb9be3e8397c983338cb71dc84d0b25';
const MEOW = '83c36d806dc92327b9e7049a565c6bff';

function replaceOnce(re, fn, what) {
    const matches = js.match(new RegExp(re.source, 'g')) || [];
    if (matches.length !== 1) {
        throw new Error(`${what}: expected exactly 1 match, found ${matches.length}`);
    }
    js = js.replace(re, fn);
}

// 1. Project JSON: sprite costumes + sounds.
replaceOnce(
    new RegExp(`costumes:\\[\\{assetId:"${OLD}",name:(\\w+)\\((\\w+)\\.costume,\\{index:1\\}\\),bitmapResolution:1,md5ext:"${OLD}\\.svg",dataFormat:"svg",rotationCenterX:[\\d.]+,rotationCenterY:[\\d.]+\\}\\],sounds:\\[\\]`),
    (_, t, m) =>
        `costumes:[` +
        `{assetId:"${CAT_A}",name:${t}(${m}.costume,{index:1}),bitmapResolution:1,md5ext:"${CAT_A}.svg",dataFormat:"svg",rotationCenterX:48,rotationCenterY:50},` +
        `{assetId:"${CAT_B}",name:${t}(${m}.costume,{index:2}),bitmapResolution:1,md5ext:"${CAT_B}.svg",dataFormat:"svg",rotationCenterX:46,rotationCenterY:53}` +
        `],sounds:[{assetId:"${MEOW}",name:"Miau",dataFormat:"wav",format:"",rate:22050,sampleCount:18688,md5ext:"${MEOW}.wav"}]`,
    'default project sprite'
);

// 2. Bundled default assets handed to scratch-storage.
const svg = (id) => JSON.stringify(fs.readFileSync(path.join(assetDir, `${id}.svg`), 'utf8'));
const wav = fs.readFileSync(path.join(assetDir, `${MEOW}.wav`)).toString('base64');
replaceOnce(
    new RegExp(`\\{id:"${OLD}",assetType:"ImageVector",dataFormat:"SVG",data:(\\w+)\\.encode\\([\\w.]+\\)\\}`),
    (_, enc) =>
        `{id:"${CAT_A}",assetType:"ImageVector",dataFormat:"SVG",data:${enc}.encode(${svg(CAT_A)})},` +
        `{id:"${CAT_B}",assetType:"ImageVector",dataFormat:"SVG",data:${enc}.encode(${svg(CAT_B)})},` +
        `{id:"${MEOW}",assetType:"Sound",dataFormat:"WAV",data:Uint8Array.from(atob("${wav}"),c=>c.charCodeAt(0))}`,
    'default project assets'
);

fs.writeFileSync(file, js);
console.log('patched default project: Scratch Cat + Miau');
