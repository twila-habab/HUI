import { createRequire } from "node:module";
import path from "node:path";
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";

// Draws /ship's picture: two avatars with a big heart and the score between them.

const require = createRequire(import.meta.url);
const SANS = path.dirname(require.resolve("@expo-google-fonts/noto-sans/package.json"));
GlobalFonts.registerFromPath(`${SANS}/700Bold/NotoSans_700Bold.ttf`, "Ship Bold");

/** Logical size; the PNG is drawn at SCALE× for sharpness. */
const WIDTH = 720;
const HEIGHT = 240;
const SCALE = 2;
const AVATAR = 176;
const HEART = 150;

export async function renderShip(avatarA: string, avatarB: string, percent: number): Promise<Buffer> {
  const canvas = createCanvas(WIDTH * SCALE, HEIGHT * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  ctx.beginPath();
  ctx.roundRect(0, 0, WIDTH, HEIGHT, 24);
  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#ff9a9e");
  background.addColorStop(1, "#fad0c4");
  ctx.fillStyle = background;
  ctx.fill();

  // Little hearts floating in the background, the same every time.
  for (const [x, y, size, alpha] of [
    [40, 30, 22, 0.5], [300, 24, 16, 0.4], [420, 210, 20, 0.45], [690, 40, 18, 0.5],
    [250, 200, 14, 0.35], [470, 30, 12, 0.4], [20, 205, 16, 0.4], [700, 200, 24, 0.45],
  ] as const) {
    heartPath(ctx, x, y, size);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fill();
  }

  await Promise.all([
    drawAvatar(ctx, avatarA, 40 + AVATAR / 2, HEIGHT / 2),
    drawAvatar(ctx, avatarB, WIDTH - 40 - AVATAR / 2, HEIGHT / 2),
  ]);

  // The heart's fill rises with the score, like a love meter.
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2 + 6;
  heartPath(ctx, cx, cy, HEART);
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fill();
  ctx.save();
  heartPath(ctx, cx, cy, HEART);
  ctx.clip();
  const top = cy - HEART / 2;
  const level = top + HEART * (1 - percent / 100);
  const fill = ctx.createLinearGradient(0, top, 0, top + HEART);
  fill.addColorStop(0, "#ff4d6d");
  fill.addColorStop(1, "#c9184a");
  ctx.fillStyle = fill;
  ctx.fillRect(cx - HEART, level, HEART * 2, HEART * 2);
  ctx.restore();
  heartPath(ctx, cx, cy, HEART);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.font = "40px 'Ship Bold'";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#800f2f";
  ctx.strokeText(`${percent}%`, cx, cy - 6);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${percent}%`, cx, cy - 6);

  return canvas.encode("png");
}

async function drawAvatar(ctx: SKRSContext2D, url: string, cx: number, cy: number): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  const image = response?.ok ? await loadImage(Buffer.from(await response.arrayBuffer())).catch(() => null) : null;

  ctx.beginPath();
  ctx.arc(cx, cy, AVATAR / 2 + 6, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, AVATAR / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#ffb3c1";
  ctx.fill();
  if (image) ctx.drawImage(image, cx - AVATAR / 2, cy - AVATAR / 2, AVATAR, AVATAR);
  ctx.restore();
}

/** A heart `size` wide and tall, centered on (cx, cy). */
function heartPath(ctx: SKRSContext2D, cx: number, cy: number, size: number): void {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s);
  ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 0.9, cy - s * 1.3, cx, cy - s * 0.45);
  ctx.bezierCurveTo(cx + s * 0.9, cy - s * 1.3, cx + s * 1.6, cy - s * 0.1, cx, cy + s);
  ctx.closePath();
}
