import { AttachmentBuilder, EmbedBuilder, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getLeaderboard, getRank } from "../levels.js";
import { renderRankCard } from "../rankCard.js";
import type { Command } from "./types.js";

const LEADERBOARD_SIZE = 10;
const LEADERBOARD_COLOR = 0xf1c40f;
const MEDALS = ["🥇", "🥈", "🥉"];

export const rank: Command = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your level, or someone else's")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName("user").setDescription("Whose level to show (default: you)")),
  async execute(interaction) {
    // Fetching the avatar and drawing can take a moment.
    await interaction.deferReply();
    const user = interaction.options.getUser("user") ?? interaction.user;
    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
    const { rank, position } = await getRank(interaction.guildId!, user.id);
    const image = await renderRankCard({
      rank,
      position,
      name: member?.displayName ?? user.displayName,
      avatarUrl: (member ?? user).displayAvatarURL({ extension: "png", size: 256 }),
      // #000000 means no colored role.
      accent: member && member.displayHexColor !== "#000000" ? member.displayHexColor : undefined,
    });
    await interaction.editReply({ files: [new AttachmentBuilder(image, { name: "rank.png" })] });
  },
};

export const leaderboard: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription(`Show the top ${LEADERBOARD_SIZE} members by level`)
    .setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const guildId = interaction.guildId!;
    const [top, own] = await Promise.all([
      getLeaderboard(guildId, LEADERBOARD_SIZE),
      getRank(guildId, interaction.user.id),
    ]);
    const embed = new EmbedBuilder()
      .setColor(LEADERBOARD_COLOR)
      .setTitle(`🏆 ${interaction.guild?.name ?? "Server"} leaderboard`)
      .setThumbnail(interaction.guild?.iconURL() ?? null)
      .setDescription(
        top.length === 0
          ? "Nobody has any XP yet. Start chatting!"
          : top
              .map((rank, i) => {
                const place = MEDALS[i] ?? `**${i + 1}.**`;
                return `${place} <@${rank.userId}>\n-# Level ${rank.level} · ${rank.xp.toLocaleString("en")} XP`;
              })
              .join("\n"),
      )
      .setFooter({
        text: `You're #${own.position} · Level ${own.rank.level} · ${own.rank.xp.toLocaleString("en")} XP`,
        iconURL: interaction.user.displayAvatarURL(),
      });
    await interaction.reply({ embeds: [embed] });
  },
};
