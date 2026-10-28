// Gera os ícones da PWA a partir do ícone da marca (public/marca/icono.png).
//
//   node scripts/pwa-icons.mjs [--src public/marca/icono.png] [--bg "#0F1419"]
//
// Rodar cada vez que o ícone do cliente mude; o resultado (public/icons/) se
// versiona com o repositório do cliente.
// Geram-se com margem ("padding") para que no Android, que recorta o ícone em
// círculo ou quadrado arredondado (maskable), o logo não fique cortado.

import sharp from "sharp";
import { mkdirSync } from "fs";

const args = process.argv.slice(2);
const opt = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const SRC = opt("--src", "public/marca/icono.png");
const OUT = "public/icons";
const SIZES = [72, 96, 128, 144, 192, 512];
const hex = opt("--bg", "#0F1419").replace("#", "");
const BG = {
  r: parseInt(hex.slice(0, 2), 16),
  g: parseInt(hex.slice(2, 4), 16),
  b: parseInt(hex.slice(4, 6), 16),
  alpha: 1,
}; // fundo do ícone: a cor do sidebar da marca

mkdirSync(OUT, { recursive: true });

for (const size of SIZES) {
  const inner = Math.round(size * 0.72);
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/icon-${size}.png`);
  console.log(`icon-${size}.png`);
}

// O iOS não usa o manifest para o ícone da tela inicial: usa apple-icon.
const appleInner = Math.round(180 * 0.72);
const appleLogo = await sharp(SRC)
  .resize(appleInner, appleInner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 4, background: BG } })
  .composite([{ input: appleLogo, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile("src/app/apple-icon.png");
console.log("src/app/apple-icon.png");
