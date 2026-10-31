import { createRequire } from "node:module";
import path from "node:path";
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import type { Rank } from "./levels.js";

// Draws /rank's card: avatar, name, rank, level and a progress bar.

const require = createRequire(import.meta.url);
const SANS = path.dirname(require.resolve("@expo-google-fonts/noto-sans/package.json"));
GlobalFonts.registerFromPath(`${SANS}/600SemiBold/NotoSans_600SemiBold.ttf`, "Rank SemiBold");
GlobalFonts.registerFromPath(`${SANS}/700Bold/NotoSans_700Bold.ttf`, "Rank Bold");

const COLORS = {
  background: "#1e1f22",
  panel: "#2b2d31",
  name: "#f2f3f5",
  muted: "#949ba4",
  track: "#4e5058",
};
/** Used when the member has no colored role. */
const DEFAULT_ACCENT = "#5865f2";

/** Logical size; the PNG is drawn at SCALE× for sharpness. */
const WIDTH = 800;
const HEIGHT = 240;
const SCALE = 2;
const PAD = 24;
const AVATAR = 160;
const TEXT_X = PAD * 2 + AVATAR + 16;
const TEXT_RIGHT = WIDTH - PAD * 2;
const BAR = { y: 160, height: 28 };

export interface RankCardInput {
  rank: Rank;
  position: number;
  name: string;
  avatarUrl: string;
  /** Hex color of the member's top colored role, if any. */
  accent?: string;
}

export async function renderRankCard({ rank, position, name, avatarUrl, accent = DEFAULT_ACCENT }: RankCardInput): Promise<Buffer> {
  const canvas = createCanvas(WIDTH * SCALE, HEIGHT * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  // Card, with a soft glow of the accent color from the left.
  roundRect(ctx, 0, 0, WIDTH, HEIGHT, 24);
  ctx.fillStyle = COLORS.background;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const glow = ctx.createLinearGradient(0, 0, WIDTH, 0);
  glow.addColorStop(0, withAlpha(accent, 0.35));
  glow.addColorStop(0.6, withAlpha(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();

  await drawAvatar(ctx, avatarUrl, accent);

  // Rank and level, top right; the name gets whatever room is left.
  ctx.textBaseline = "alphabetic";
  let x = TEXT_RIGHT;
  x = drawStat(ctx, x, "LEVEL", String(rank.level), accent);
  x = drawStat(ctx, x - 28, "RANK", `#${position}`, COLORS.name);
  ctx.font = "34px 'Rank Bold'";
  ctx.fillStyle = COLORS.name;
  ctx.textAlign = "left";
  ctx.fillText(truncate(ctx, name, x - 24 - TEXT_X), TEXT_X, 96);

  // Progress bar with the XP numbers above it.
  const barWidth = TEXT_RIGHT - TEXT_X;
  ctx.font = "18px 'Rank SemiBold'";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`${rank.xp.toLocaleString("en")} XP total`, TEXT_X, BAR.y - 12);
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.name;
  ctx.fillText(`${rank.progress.toLocaleString("en")} / ${rank.needed.toLocaleString("en")} XP`, TEXT_RIGHT, BAR.y - 12);

  roundRect(ctx, TEXT_X, BAR.y, barWidth, BAR.height, BAR.height / 2);
  ctx.fillStyle = COLORS.track;
  ctx.fill();
  // Never draw a sliver thinner than the bar is tall, or the rounded ends look broken.
  const filled = Math.max(BAR.height, (rank.progress / rank.needed) * barWidth);
  if (rank.progress > 0) {
    roundRect(ctx, TEXT_X, BAR.y, filled, BAR.height, BAR.height / 2);
    const fill = ctx.createLinearGradient(TEXT_X, 0, TEXT_X + barWidth, 0);
    fill.addColorStop(0, accent);
    fill.addColorStop(1, lighten(accent, 0.4));
    ctx.fillStyle = fill;
    ctx.fill();
  }

  ctx.textAlign = "left";
  ctx.font = "16px 'Rank SemiBold'";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`${(rank.needed - rank.progress).toLocaleString("en")} XP to level ${rank.level + 1}`, TEXT_X, BAR.y + BAR.height + 26);

  return canvas.encode("png");
}

async function drawAvatar(ctx: SKRSContext2D, url: string, accent: string): Promise<void> {
  const cx = PAD * 2 + AVATAR / 2;
  const cy = HEIGHT / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, AVATAR / 2 + 6, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, AVATAR / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (response?.ok) {
    const image = await loadImage(Buffer.from(await response.arrayBuffer())).catch(() => null);
    if (image) ctx.drawImage(image, cx - AVATAR / 2, cy - AVATAR / 2, AVATAR, AVATAR);
  }
  ctx.restore();
}

/** Draws a small label over a big value, right-aligned at `right`. Returns the left edge. */
function drawStat(ctx: SKRSContext2D, right: number, label: string, value: string, color: string): number {
  ctx.textAlign = "right";
  ctx.font = "48px 'Rank Bold'";
  ctx.fillStyle = color;
  ctx.fillText(value, right, 96);
  const valueWidth = ctx.measureText(value).width;
  ctx.font = "18px 'Rank SemiBold'";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(label, right - valueWidth - 8, 96);
  return right - valueWidth - 8 - ctx.measureText(label).width;
}

function truncate(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 0 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) chars.pop();
  return `${chars.join("")}…`;
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function withAlpha(hex: string, alpha: number): string {
  return `rgba(${rgb(hex).join(", ")}, ${alpha})`;
}

/** Mixes the color toward white by `amount` (0–1). */
function lighten(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex).map((c) => Math.round(c + (255 - c) * amount));
  return `rgb(${r}, ${g}, ${b})`;
}
