import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";

export const ping: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's latency"),
  async execute(interaction) {
    const { resource } = await interaction.reply({
      content: "Pinging...",
      withResponse: true,
    });
    const roundTrip =
      (resource?.message?.createdTimestamp ?? Date.now()) -
      interaction.createdTimestamp;
    await interaction.editReply(
      `Pong! Round trip: ${roundTrip}ms · WebSocket: ${interaction.client.ws.ping}ms`,
    );
  },
};
