import { AttachmentBuilder, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getRank } from "../levels.js";
import { renderWanted } from "../wantedImage.js";
import type { Command } from "./types.js";

const CRIMES = [
  "leaving people on read",
  "replying \"k\"",
  "ghosting the group chat",
  "unsolicited hot takes",
  "posting cringe",
  "stealing memes",
  "pinging @everyone",
  "spoiling the movie",
  "being too funny",
  "lurking without talking",
  "typing for 5 minutes then sending \"ok\"",
  "crimes against the sleep schedule",
];

// Everyone is worth something; chatting more raises the price on your head.
const BASE_BOUNTY = 500;
const BOUNTY_PER_XP = 25;

export const wanted: Command = {
  data: new SlashCommandBuilder()
    .setName("wanted")
    .setDescription("Put a bounty on someone's head 🤠")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName("user").setDescription("Who's wanted (default: you)")),
  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser("user") ?? interaction.user;
    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
    // The bounty grows with XP; if the database is down, there's still a poster.
    const xp = await getRank(interaction.guildId!, user.id)
      .then(({ rank }) => rank.xp)
      .catch(() => 0);
    const crime = CRIMES[Math.floor(Math.random() * CRIMES.length)];
    const image = await renderWanted({
      name: member?.displayName ?? user.displayName,
      avatarUrl: (member ?? user).displayAvatarURL({ extension: "png", size: 512 }),
      bounty: BASE_BOUNTY + xp * BOUNTY_PER_XP,
      crime,
    });
    await interaction.editReply({
      content: `🤠 Yeehaw! <@${user.id}> is wanted for **${crime}**.`,
      files: [new AttachmentBuilder(image, { name: "wanted.png" })],
      allowedMentions: { parse: [] },
    });
  },
};
