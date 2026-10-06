import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";

export const echo: Command = {
  data: new SlashCommandBuilder()
    .setName("echo")
    .setDescription("Repeat a message back")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("What to say")
        .setRequired(true)
        .setMaxLength(2000),
    ),
  async execute(interaction) {
    const message = interaction.options.getString("message", true);
    await interaction.reply({ content: message, allowedMentions: { parse: [] } });
  },
};
