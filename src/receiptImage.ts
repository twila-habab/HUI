import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { MessageType, StickerFormatType, type Message } from "discord.js";

// Renders a message as a PNG that looks like Discord's dark theme. Fonts and
// emoji ship as npm packages so it renders the same on hosts without system fonts.

const require = createRequire(import.meta.url);
const packageDir = (name: string) => path.dirname(require.resolve(`${name}/package.json`));
const SANS = packageDir("@expo-google-fonts/noto-sans");
const MONO = packageDir("@expo-google-fonts/noto-sans-mono");
const TWEMOJI = packageDir("@twemoji/svg");

for (const [family, file] of [
  ["Receipt Regular", `${SANS}/400Regular/NotoSans_400Regular.ttf`],
  ["Receipt Italic", `${SANS}/400Regular_Italic/NotoSans_400Regular_Italic.ttf`],
  ["Receipt SemiBold", `${SANS}/600SemiBold/NotoSans_600SemiBold.ttf`],
  ["Receipt Bold", `${SANS}/700Bold/NotoSans_700Bold.ttf`],
  ["Receipt BoldItalic", `${SANS}/700Bold_Italic/NotoSans_700Bold_Italic.ttf`],
  ["Receipt Mono", `${MONO}/400Regular/NotoSansMono_400Regular.ttf`],
] as const) {
  GlobalFonts.registerFromPath(file, family);
}

const COLORS = {
  background: "#313338",
  text: "#dbdee1",
  muted: "#949ba4",
  name: "#f2f3f5",
  link: "#00a8fc",
  mention: "#c9cdfb",
  mentionBackground: "rgba(88, 101, 242, 0.3)",
  codeBackground: "#2b2d31",
  codeBorder: "#1e1f22",
  timestampBackground: "rgba(255, 255, 255, 0.06)",
  spine: "#4e5058",
};

/** Logical width; the PNG is drawn at SCALE× for sharpness. */
const WIDTH = 640;
const SCALE = 2;
const PAD = 16;
const CONTENT_X = 72;
const CONTENT_WIDTH = WIDTH - CONTENT_X - PAD;
const FONT_SIZE = 16;
const LINE_HEIGHT = 22;
const EMOJI_SIZE = 22;
const JUMBO_SIZE = 48;
const MEDIA_MAX = { width: 400, height: 300 };
const STICKER_SIZE = 160;

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" });

interface Style {
  bold?: boolean;
  semibold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  size?: number;
  color?: string;
  background?: string;
}

type Piece =
  | { kind: "text"; text: string; style: Style }
  | { kind: "emoji"; image: Image }
  | { kind: "codeblock"; text: string };

/** Something drawn left to right within a line, centered on the line's midpoint. */
interface Atom {
  kind: "word" | "space" | "break" | "block";
  width: number;
  height: number;
  draw(ctx: SKRSContext2D, x: number, centerY: number): void;
}

/** Something stacked vertically in the message body. */
interface Block {
  height: number;
  draw(ctx: SKRSContext2D, x: number, top: number): void;
}

function font(style: Style): string {
  const size = style.size ?? FONT_SIZE;
  if (style.code) return `${size * 0.875}px "Receipt Mono"`;
  const face = style.bold
    ? style.italic ? "BoldItalic" : "Bold"
    : style.semibold ? "SemiBold" : style.italic ? "Italic" : "Regular";
  return `${size}px "Receipt ${face}"`;
}

// Scratch context, only used to measure text.
const measurer = createCanvas(1, 1).getContext("2d");
function measure(text: string, fontString: string): number {
  measurer.font = fontString;
  return measurer.measureText(text).width;
}

// --- Images ---------------------------------------------------------------

const imageCache = new Map<string, Promise<Image | undefined>>();

function cachedImage(key: string, load: () => Promise<Image>): Promise<Image | undefined> {
  let image = imageCache.get(key);
  if (!image) {
    // Forget failures so a network blip doesn't stick for the bot's lifetime.
    image = load().catch(() => {
      imageCache.delete(key);
      return undefined;
    });
    imageCache.set(key, image);
  }
  return image;
}

async function loadRemote(url: string): Promise<Image | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return undefined;
    return await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch {
    return undefined;
  }
}

function twemoji(emoji: string): Promise<Image | undefined> | undefined {
  // Twemoji file names are the code points in hex, usually without U+FE0F.
  const codes = [...emoji].map((char) => char.codePointAt(0)!.toString(16));
  const file = [codes.filter((code) => code !== "fe0f").join("-"), codes.join("-")]
    .map((name) => path.join(TWEMOJI, `${name}.svg`))
    .find((candidate) => existsSync(candidate));
  return file ? cachedImage(file, () => loadImage(file)) : undefined;
}

function customEmoji(id: string): Promise<Image | undefined> {
  const url = `https://cdn.discordapp.com/emojis/${id}.png?size=96`;
  return cachedImage(url, async () => {
    const image = await loadRemote(url);
    if (!image) throw new Error(`Couldn't load emoji ${id}`);
    return image;
  });
}

// --- Parsing --------------------------------------------------------------

// Leftmost match wins; on a tie, the earlier alternative does.
const INLINE = new RegExp(
  [
    /```(?:[\w+-]*\n)?(?<codeblock>[\s\S]*?)\n?```/,
    /`(?<code>[^`]+)`/,
    /<a?:(?<emojiName>\w+):(?<emojiId>\d+)>/,
    /<@!?(?<user>\d+)>/,
    /<@&(?<role>\d+)>/,
    /<#(?<channel>\d+)>/,
    /<t:(?<time>-?\d+)(?::[tTdDfFR])?>/,
    /(?<url>https?:\/\/[^\s<]+[^\s<.,:;"')\]])/,
    /\*\*(?<bold>[\s\S]+?)\*\*(?!\*)/,
    /__(?<underline>[\s\S]+?)__(?!_)/,
    /~~(?<strike>[\s\S]+?)~~/,
    /\*(?<italic>[^*\s](?:[\s\S]*?[^*\s])?)\*(?!\*)/,
    /(?<!\w)_(?<underscoreItalic>[^_]+?)_(?!\w)/,
  ]
    .map((pattern) => pattern.source)
    .join("|"),
  "g",
);

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const segmenter = new Intl.Segmenter();

const mentionStyle = (style: Style, color = COLORS.mention): Style => ({
  ...style,
  color,
  background: COLORS.mentionBackground,
});

/** Splits plain text into text and Twemoji pieces. */
async function plain(text: string, style: Style): Promise<Piece[]> {
  const pieces: Piece[] = [];
  let buffer = "";
  for (const { segment } of segmenter.segment(text)) {
    const image = EMOJI.test(segment) ? await twemoji(segment) : undefined;
    if (!image) {
      buffer += segment;
      continue;
    }
    if (buffer) pieces.push({ kind: "text", text: buffer, style });
    buffer = "";
    pieces.push({ kind: "emoji", image });
  }
  if (buffer) pieces.push({ kind: "text", text: buffer, style });
  return pieces;
}

async function userName(message: Message, id: string): Promise<string> {
  const member = await message.guild?.members.fetch(id).catch(() => null);
  if (member) return member.displayName;
  const user = await message.client.users.fetch(id).catch(() => null);
  return user?.displayName ?? "unknown-user";
}

/** Parses Discord markdown, mentions and emoji into drawable pieces. */
async function parse(text: string, style: Style, message: Message): Promise<Piece[]> {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    pieces.push(...(await plain(text.slice(last, match.index), style)));
    last = match.index + match[0].length;
    const g = match.groups!;

    if (g.codeblock !== undefined) {
      pieces.push({ kind: "codeblock", text: g.codeblock });
    } else if (g.code !== undefined) {
      pieces.push({ kind: "text", text: g.code, style: { ...style, code: true, background: COLORS.codeBackground } });
    } else if (g.emojiId) {
      const image = await customEmoji(g.emojiId);
      pieces.push(image ? { kind: "emoji", image } : { kind: "text", text: `:${g.emojiName}:`, style });
    } else if (g.user) {
      pieces.push({ kind: "text", text: `@${await userName(message, g.user)}`, style: mentionStyle(style) });
    } else if (g.role) {
      const role = message.guild?.roles.cache.get(g.role);
      const color = role?.color ? role.hexColor : undefined;
      pieces.push({ kind: "text", text: `@${role?.name ?? "unknown-role"}`, style: mentionStyle(style, color) });
    } else if (g.channel) {
      const channel = message.client.channels.cache.get(g.channel);
      const name = channel && "name" in channel && channel.name ? channel.name : "unknown";
      pieces.push({ kind: "text", text: `#${name}`, style: mentionStyle(style) });
    } else if (g.time) {
      const date = dateFormat.format(new Date(Number(g.time) * 1000));
      pieces.push({ kind: "text", text: date, style: { ...style, background: COLORS.timestampBackground } });
    } else if (g.url) {
      pieces.push({ kind: "text", text: g.url, style: { ...style, color: COLORS.link } });
    } else if (g.bold !== undefined) {
      pieces.push(...(await parse(g.bold, { ...style, bold: true }, message)));
    } else if (g.underline !== undefined) {
      pieces.push(...(await parse(g.underline, { ...style, underline: true }, message)));
    } else if (g.strike !== undefined) {
      pieces.push(...(await parse(g.strike, { ...style, strike: true }, message)));
    } else {
      pieces.push(...(await parse(g.italic ?? g.underscoreItalic!, { ...style, italic: true }, message)));
    }
  }
  pieces.push(...(await plain(text.slice(last), style)));
  return pieces;
}

// --- Layout ---------------------------------------------------------------

function roundRect(ctx: SKRSContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function textAtom(text: string, style: Style): Atom {
  const fontString = font(style);
  const width = measure(text, fontString);
  const size = style.size ?? FONT_SIZE;
  return {
    kind: /^\s+$/.test(text) ? "space" : "word",
    width,
    height: LINE_HEIGHT,
    draw(ctx, x, centerY) {
      if (style.background) {
        ctx.fillStyle = style.background;
        roundRect(ctx, x, centerY - size * 0.65, width, size * 1.3, 3);
      }
      ctx.font = fontString;
      ctx.fillStyle = style.color ?? COLORS.text;
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, centerY);
      if (style.underline) ctx.fillRect(x, centerY + size * 0.55, width, 1);
      if (style.strike) ctx.fillRect(x, centerY, width, 1);
    },
  };
}

/** Breaks a word that is wider than a whole line into pieces that fit. */
function splitWord(word: string, style: Style, maxWidth: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const { segment } of segmenter.segment(word)) {
    if (current && measure(current + segment, font(style)) > maxWidth) {
      parts.push(current);
      current = "";
    }
    current += segment;
  }
  if (current) parts.push(current);
  return parts;
}

function codeBlockAtom(text: string, maxWidth: number): Atom {
  const style: Style = { code: true };
  const fontString = font(style);
  const lineHeight = 18;
  const padding = 8;
  const lines = text.split("\n").flatMap((line) => (line ? splitWord(line, style, maxWidth - padding * 2) : [""]));
  const height = lines.length * lineHeight + padding * 2;
  return {
    kind: "block",
    width: maxWidth,
    height: height + 8,
    draw(ctx, x, centerY) {
      const top = centerY - height / 2;
      ctx.fillStyle = COLORS.codeBorder;
      roundRect(ctx, x, top, maxWidth, height, 4);
      ctx.fillStyle = COLORS.codeBackground;
      roundRect(ctx, x + 1, top + 1, maxWidth - 2, height - 2, 4);
      ctx.font = fontString;
      ctx.fillStyle = COLORS.text;
      ctx.textBaseline = "middle";
      lines.forEach((line, i) => ctx.fillText(line, x + padding, top + padding + lineHeight * (i + 0.5)));
    },
  };
}

function toAtoms(pieces: Piece[], maxWidth: number, inlineEmojiSize = EMOJI_SIZE, allowJumbo = true): Atom[] {
  const jumbo = allowJumbo && pieces.every((p) => p.kind === "emoji" || (p.kind === "text" && !p.text.trim()));
  const emojiSize = jumbo ? JUMBO_SIZE : inlineEmojiSize;
  const atoms: Atom[] = [];
  for (const piece of pieces) {
    if (piece.kind === "emoji") {
      atoms.push({
        kind: "word",
        width: emojiSize + 2,
        height: jumbo ? emojiSize + 6 : Math.min(LINE_HEIGHT, emojiSize),
        draw: (ctx, x, centerY) => ctx.drawImage(piece.image, x + 1, centerY - emojiSize / 2, emojiSize, emojiSize),
      });
    } else if (piece.kind === "codeblock") {
      atoms.push(codeBlockAtom(piece.text, maxWidth));
    } else {
      for (const token of piece.text.match(/\n|[^\S\n]+|\S+/g) ?? []) {
        if (token === "\n") {
          atoms.push({ kind: "break", width: 0, height: LINE_HEIGHT, draw() {} });
        } else if (measure(token, font(piece.style)) > maxWidth) {
          for (const part of splitWord(token, piece.style, maxWidth)) atoms.push(textAtom(part, piece.style));
        } else {
          atoms.push(textAtom(token, piece.style));
        }
      }
    }
  }
  return atoms;
}

/** Word-wraps atoms into lines, each returned as a block. */
function wrap(atoms: Atom[], maxWidth: number): Block[] {
  const lines: { atoms: { atom: Atom; x: number }[]; height: number }[] = [];
  let line: (typeof lines)[number] = { atoms: [], height: LINE_HEIGHT };
  let x = 0;
  let wrapped = false;
  let afterBlock = false;
  const newLine = (isWrap: boolean) => {
    lines.push(line);
    line = { atoms: [], height: LINE_HEIGHT };
    x = 0;
    wrapped = isWrap;
  };

  for (const atom of atoms) {
    const justAfterBlock = afterBlock;
    afterBlock = atom.kind === "block";
    if (atom.kind === "break") {
      // A code block already ends its line, so the newline after it adds nothing.
      if (!justAfterBlock) newLine(false);
      continue;
    }
    if (atom.kind === "block") {
      if (line.atoms.length > 0) newLine(false);
      line.atoms.push({ atom, x: 0 });
      line.height = atom.height;
      newLine(false);
      continue;
    }
    if (atom.kind === "space" && (x + atom.width > maxWidth || (wrapped && x === 0))) continue;
    if (x + atom.width > maxWidth && line.atoms.length > 0) newLine(true);
    line.atoms.push({ atom, x });
    line.height = Math.max(line.height, atom.height);
    x += atom.width;
  }
  if (line.atoms.length > 0) lines.push(line);
  return lines.map((l) => ({
    height: l.height,
    draw(ctx, left, top) {
      for (const { atom, x: offset } of l.atoms) atom.draw(ctx, left + offset, top + l.height / 2);
    },
  }));
}

/** One line of text with emoji, cut off with an ellipsis past maxWidth. */
async function singleLine(text: string, style: Style, maxWidth: number) {
  const size = style.size ?? FONT_SIZE;
  const atoms = toAtoms(await plain(text.replace(/\s+/g, " "), style), Infinity, Math.round(size * 1.25), false);
  let width = atoms.reduce((sum, atom) => sum + atom.width, 0);
  if (width > maxWidth) {
    const ellipsis = textAtom("…", style);
    while (atoms.length > 0 && width + ellipsis.width > maxWidth) width -= atoms.pop()!.width;
    atoms.push(ellipsis);
    width += ellipsis.width;
  }
  return {
    width,
    draw(ctx: SKRSContext2D, x: number, centerY: number) {
      for (const atom of atoms) {
        atom.draw(ctx, x, centerY);
        x += atom.width;
      }
    },
  };
}

function mediaBlock(image: Image, maxWidth: number, maxHeight: number): Block {
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    height: height + 8,
    draw(ctx, x, top) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, top + 4, width, height, 8);
      ctx.clip();
      ctx.drawImage(image, x, top + 4, width, height);
      ctx.restore();
    },
  };
}

async function fileBlock(name: string): Promise<Block> {
  const boxWidth = Math.min(CONTENT_WIDTH, 400);
  const label = await singleLine(`📎 ${name}`, { color: COLORS.link }, boxWidth - 24);
  return {
    height: 48,
    draw(ctx, x, top) {
      ctx.fillStyle = COLORS.codeBorder;
      roundRect(ctx, x, top + 4, boxWidth, 40, 8);
      ctx.fillStyle = COLORS.codeBackground;
      roundRect(ctx, x + 1, top + 5, boxWidth - 2, 38, 8);
      label.draw(ctx, x + 12, top + 24);
    },
  };
}

// --- Rendering ------------------------------------------------------------

async function author(message: Message) {
  const member =
    message.member ?? (await message.guild?.members.fetch(message.author.id).catch(() => null)) ?? null;
  return {
    name: member?.displayName ?? message.author.displayName,
    color: member?.displayColor ? member.displayHexColor : COLORS.name,
    avatar: await loadRemote((member ?? message.author).displayAvatarURL({ extension: "png", size: 128 })),
  };
}

function drawAvatar(ctx: SKRSContext2D, image: Image | undefined, x: number, y: number, size: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (image) ctx.drawImage(image, x, y, size, size);
  else {
    ctx.fillStyle = COLORS.spine;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

/** The "replying to" line Discord shows above a reply. */
async function replyHeader(message: Message): Promise<Block | undefined> {
  if (message.type !== MessageType.Reply) return undefined;
  const referenced = await message.fetchReference().catch(() => null);
  const replied = referenced ? await author(referenced) : undefined;
  const nameStyle: Style = { semibold: true, size: 14, color: replied?.color };
  const name = replied ? await singleLine(`@${replied.name}`, nameStyle, CONTENT_WIDTH / 2) : undefined;
  const snippetStyle: Style = { size: 14, color: COLORS.muted, italic: !referenced?.cleanContent.trim() };
  const snippetText = !referenced
    ? "Original message was deleted"
    : referenced.cleanContent.trim() || "Click to see attachment";
  const snippet = await singleLine(snippetText, snippetStyle, CONTENT_WIDTH - 20 - (name ? name.width + 6 : 0));
  return {
    height: 22,
    draw(ctx, _x, top) {
      const centerY = top + 11;
      // The curved line from the avatar up to the replied-to message.
      ctx.strokeStyle = COLORS.spine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PAD + 20, top + 24);
      ctx.lineTo(PAD + 20, centerY + 6);
      ctx.arcTo(PAD + 20, centerY, PAD + 26, centerY, 6);
      ctx.lineTo(CONTENT_X - 4, centerY);
      ctx.stroke();

      let x = CONTENT_X;
      if (replied && name) {
        drawAvatar(ctx, replied.avatar, x, centerY - 8, 16);
        name.draw(ctx, x + 20, centerY);
        x += 20 + name.width + 6;
      }
      snippet.draw(ctx, x, centerY);
    },
  };
}

/** The content, attachments, media embeds and stickers of one message. */
async function messageBody(message: Message): Promise<Block[]> {
  // Discord hides a link whose only purpose is to show an image or GIF embed.
  const mediaEmbeds = message.embeds.filter((e) => e.data.type === "image" || e.data.type === "gifv");
  const content = mediaEmbeds.length > 0 && mediaEmbeds.some((e) => e.url === message.content.trim()) ? "" : message.content;

  const pieces = await parse(content, {}, message);
  if (message.editedTimestamp && content) {
    pieces.push({ kind: "text", text: " (edited)", style: { size: 10, color: COLORS.muted } });
  }
  const body: Block[] = wrap(toAtoms(pieces, CONTENT_WIDTH), CONTENT_WIDTH);

  const mediaWidth = Math.min(MEDIA_MAX.width, CONTENT_WIDTH);
  for (const attachment of message.attachments.values()) {
    const image = attachment.contentType?.startsWith("image/") ? await loadRemote(attachment.url) : undefined;
    body.push(image ? mediaBlock(image, mediaWidth, MEDIA_MAX.height) : await fileBlock(attachment.name));
  }
  for (const embed of mediaEmbeds) {
    const url = embed.thumbnail?.proxyURL ?? embed.thumbnail?.url ?? embed.url;
    const image = url ? await loadRemote(url) : undefined;
    if (image) body.push(mediaBlock(image, mediaWidth, MEDIA_MAX.height));
  }
  for (const sticker of message.stickers.values()) {
    const image =
      sticker.format === StickerFormatType.PNG || sticker.format === StickerFormatType.APNG
        ? await loadRemote(sticker.url)
        : undefined;
    const fallback: Piece = { kind: "text", text: `[sticker: ${sticker.name}]`, style: { color: COLORS.muted } };
    body.push(...(image ? [mediaBlock(image, STICKER_SIZE, STICKER_SIZE)] : wrap(toAtoms([fallback], CONTENT_WIDTH), CONTENT_WIDTH)));
  }
  return body;
}

/** Blocks drawn one under another, starting at the content column. */
function stacked(blocks: Block[]): Block {
  return {
    height: blocks.reduce((sum, block) => sum + block.height, 0),
    draw(ctx, _x, top) {
      for (const block of blocks) {
        block.draw(ctx, CONTENT_X, top);
        top += block.height;
      }
    },
  };
}

/** A message with its avatar, name and time, plus the reply line above it if any. */
async function headedMessage(message: Message): Promise<Block> {
  const [who, reply, body] = await Promise.all([author(message), replyHeader(message), messageBody(message)]);
  const name = await singleLine(who.name, { semibold: true, color: who.color }, CONTENT_WIDTH - 140);
  const content = stacked(body);
  const replyHeight = reply?.height ?? 0;
  return {
    height: replyHeight + Math.max(40, LINE_HEIGHT + content.height),
    draw(ctx, _x, sectionTop) {
      reply?.draw(ctx, 0, sectionTop);
      const top = sectionTop + replyHeight;
      drawAvatar(ctx, who.avatar, PAD, top, 40);
      name.draw(ctx, CONTENT_X, top + LINE_HEIGHT / 2);
      textAtom(dateFormat.format(message.createdAt), { size: 12, color: COLORS.muted }).draw(
        ctx,
        CONTENT_X + name.width + 8,
        top + LINE_HEIGHT / 2 + 1,
      );
      content.draw(ctx, CONTENT_X, top + LINE_HEIGHT);
    },
  };
}

// Like Discord, a message from the same person shortly after their last one
// skips the avatar and name.
const GROUP_WINDOW_MS = 7 * 60_000;
const GROUP_GAP = 16;
const CONTINUATION_GAP = 2;

function continuesGroup(previous: Message | undefined, message: Message): boolean {
  return (
    previous !== undefined &&
    previous.author.id === message.author.id &&
    message.type !== MessageType.Reply &&
    message.createdTimestamp - previous.createdTimestamp < GROUP_WINDOW_MS
  );
}

/** Renders messages, oldest first, as one image. */
export async function renderReceipt(messages: Message[]): Promise<Buffer> {
  const sections = await Promise.all(
    messages.map(async (message, i) => {
      const continues = continuesGroup(messages[i - 1], message);
      return {
        gap: i === 0 ? 0 : continues ? CONTINUATION_GAP : GROUP_GAP,
        block: continues ? stacked(await messageBody(message)) : await headedMessage(message),
      };
    }),
  );
  const height = PAD * 2 + sections.reduce((sum, { gap, block }) => sum + gap + block.height, 0);

  const canvas = createCanvas(WIDTH * SCALE, Math.ceil(height * SCALE));
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, height);

  let y = PAD;
  for (const { gap, block } of sections) {
    y += gap;
    block.draw(ctx, 0, y);
    y += block.height;
  }
  return canvas.encode("png");
}
