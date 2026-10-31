import { createRequire } from "node:module";
import path from "node:path";
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";

// Draws /wanted's Wild West poster: the avatar in sepia, a name and a bounty.

const require = createRequire(import.meta.url);
const RYE = path.dirname(require.resolve("@expo-google-fonts/rye/package.json"));
GlobalFonts.registerFromPath(`${RYE}/400Regular/Rye_400Regular.ttf`, "Wanted Western");

/** Logical size; the PNG is drawn at SCALE× for sharpness. */
const WIDTH = 480;
const HEIGHT = 680;
const SCALE = 2;
const PHOTO = { x: 90, y: 172, size: 300 };
const INK = "#3b2414";

export interface WantedInput {
  name: string;
  avatarUrl: string;
  bounty: number;
  crime: string;
}

export async function renderWanted({ name, avatarUrl, bounty, crime }: WantedInput): Promise<Buffer> {
  const canvas = createCanvas(WIDTH * SCALE, HEIGHT * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  // Parchment, darker toward the edges like old paper.
  const paper = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 100, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.7);
  paper.addColorStop(0, "#f3e2b8");
  paper.addColorStop(1, "#c9a66b");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, WIDTH - 32, HEIGHT - 32);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(24, 24, WIDTH - 48, HEIGHT - 48);

  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "84px 'Wanted Western'";
  ctx.fillText("WANTED", WIDTH / 2, 118);
  ctx.font = "24px 'Wanted Western'";
  ctx.fillText("DEAD OR ALIVE", WIDTH / 2, 154);

  await drawPhoto(ctx, avatarUrl);

  ctx.fillStyle = INK;
  ctx.font = "34px 'Wanted Western'";
  ctx.fillText(fit(ctx, name.toUpperCase(), WIDTH - 80), WIDTH / 2, PHOTO.y + PHOTO.size + 50);
  ctx.font = "16px 'Wanted Western'";
  ctx.fillText(fit(ctx, `FOR ${crime.toUpperCase()}`, WIDTH - 80), WIDTH / 2, PHOTO.y + PHOTO.size + 80);
  ctx.font = "22px 'Wanted Western'";
  ctx.fillText("REWARD", WIDTH / 2, PHOTO.y + PHOTO.size + 118);
  ctx.font = "44px 'Wanted Western'";
  ctx.fillText(`$${bounty.toLocaleString("en")}`, WIDTH / 2, PHOTO.y + PHOTO.size + 162);

  return canvas.encode("png");
}

async function drawPhoto(ctx: SKRSContext2D, url: string): Promise<void> {
  const { x, y, size } = PHOTO;
  ctx.fillStyle = "#b08d57";
  ctx.fillRect(x, y, size, size);
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  const image = response?.ok ? await loadImage(Buffer.from(await response.arrayBuffer())).catch(() => null) : null;
  if (image) {
    ctx.save();
    ctx.filter = "sepia(0.9) contrast(1.1)";
    ctx.drawImage(image, x, y, size, size);
    ctx.restore();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, size, size);
}

/** Shrinks the current font until the text fits in `maxWidth`. */
function fit(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  const size = parseFloat(ctx.font);
  const width = ctx.measureText(text).width;
  if (width > maxWidth) ctx.font = ctx.font.replace(`${size}px`, `${Math.floor((size * maxWidth) / width)}px`);
  return text;
}
