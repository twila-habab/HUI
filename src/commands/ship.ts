import { createHash } from "node:crypto";
import { AttachmentBuilder, EmbedBuilder, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { renderShip } from "../shipImage.js";
import type { Command } from "./types.js";

const SHIP_COLOR = 0xff4d6d;

/** From worst to best; each score lands on the last tier it reaches. */
const VERDICTS: { min: number; title: string; lines: string[] }[] = [
  {
    min: 0,
    title: "💀 ABSOLUTELY NOT 💀",
    lines: [
      "The stars looked at this pairing and said \"ew\". Even I'm uncomfortable.",
      "I ran the numbers three times. Cupid has filed a restraining order.",
      "This ship sank before it left the harbour. 🚢🌊",
    ],
  },
  {
    min: 10,
    title: "🥶 Friendzone speedrun any% 🥶",
    lines: [
      "\"You're like a sibling to me\" energy. Wishing you both peace... separately.",
      "Would help you move house. Would NOT hold your hand. 🤝",
      "The vibe is \"we went to the same school once\".",
    ],
  },
  {
    min: 30,
    title: "😬 It's giving... situationship 😬",
    lines: [
      "Talks until 3am, never defines it. Classic.",
      "\"What are we?\" \"idk lol\" 💀",
      "Likes each other's stories but leaves texts on read. Toxic. Iconic.",
    ],
  },
  {
    min: 50,
    title: "😳 Ooh, there's something there 😳",
    lines: [
      "Someone's definitely sending \"u up?\" at 2am. 👀",
      "The tension in the group chat is UNREAL.",
      "One of you has already practised your signature with the other's last name.",
    ],
  },
  {
    min: 70,
    title: "🥰 OKAY LOVEBIRDS 🥰",
    lines: [
      "Get a room. A Discord VC counts. 💕",
      "Matching pfps when? Asking for the whole server.",
      "Y'all are disgustingly cute and I need you to stop. 🤢💖",
    ],
  },
  {
    min: 90,
    title: "💍 SOULMATES DETECTED 💍",
    lines: [
      "I'm already writing the wedding speech. I will be crying. uwu 😭",
      "Your love is so strong it's lagging the server. 💞",
      "Cupid retired after this one. Nothing will ever top it.",
    ],
  },
  {
    min: 100,
    title: "💖✨ 100% PERFECT MATCH ✨💖",
    lines: ["DESTINY. FATE. THE RED STRING IS REAL. I'm sobbing. Kiss already 😭💋"],
  },
];

const FOOTERS = [
  "Love Calculator 3000™ · results are legally binding",
  "Certified by the Ministry of Rizz",
  "No refunds. No take-backs. It's official now.",
  "Screenshot this for the wedding slideshow 📸",
];

/** The same pair always gets the same score, in either order. */
function hash(...parts: string[]): number {
  return createHash("sha256").update(parts.join(":")).digest().readUInt32BE(0);
}

/** First half of one name + second half of the other, e.g. Twila + Hyper = Twiper. */
function shipName(a: string, b: string): string {
  const first = [...a];
  const second = [...b];
  return first.slice(0, Math.ceil(first.length / 2)).join("") + second.slice(Math.floor(second.length / 2)).join("");
}

function heartBar(percent: number): string {
  const full = Math.round(percent / 10);
  return "💖".repeat(full) + "🖤".repeat(10 - full);
}

export const ship: Command = {
  data: new SlashCommandBuilder()
    .setName("ship")
    .setDescription("Calculate the love between two people 💘")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName("user").setDescription("Who to ship").setRequired(true))
    .addUserOption((option) => option.setName("with").setDescription("Ship them with... (default: you)")),
  async execute(interaction) {
    await interaction.deferReply();
    const a = interaction.options.getUser("user", true);
    const b = interaction.options.getUser("with") ?? interaction.user;
    const [memberA, memberB] = await Promise.all(
      [a, b].map((user) => interaction.guild?.members.fetch(user.id).catch(() => null)),
    );
    const nameA = memberA?.displayName ?? a.displayName;
    const nameB = memberB?.displayName ?? b.displayName;
    const [low, high] = [a.id, b.id].sort();
    const seed = hash("ship", low, high);
    const self = a.id === b.id;
    const botInvolved = a.id === interaction.client.user.id || b.id === interaction.client.user.id;
    const percent = self ? 100 : seed % 101;

    let title: string;
    let line: string;
    if (self) {
      title = "🪞 SELF LOVE 🪞";
      line = "Shipping yourself? Honestly? Iconic. 100%, as it should be. 💅✨";
    } else if (botInvolved) {
      title = "🤖💔 I'm flattered, but...";
      line = "I'm literally lines of code. Also I'm married to this server. It's not you, it's my source code.";
    } else {
      const verdict = VERDICTS.findLast((tier) => percent >= tier.min)!;
      title = verdict.title;
      line = verdict.lines[hash("line", low, high) % verdict.lines.length];
    }

    const image = await renderShip(
      (memberA ?? a).displayAvatarURL({ extension: "png", size: 256 }),
      (memberB ?? b).displayAvatarURL({ extension: "png", size: 256 }),
      percent,
    );
    const embed = new EmbedBuilder()
      .setColor(SHIP_COLOR)
      .setAuthor({ name: "💘 MATCHMAKING RESULTS 💘" })
      .setTitle(title)
      .setDescription(
        [
          `<@${a.id}> **+** <@${b.id}> **=** 💞 **${shipName(nameA, nameB)}** 💞`,
          "",
          `${heartBar(percent)} **${percent}%**`,
          "",
          `*${line}*`,
        ].join("\n"),
      )
      .setImage("attachment://ship.png")
      .setFooter({ text: FOOTERS[seed % FOOTERS.length] });
    await interaction.editReply({ embeds: [embed], files: [new AttachmentBuilder(image, { name: "ship.png" })] });
  },
};
