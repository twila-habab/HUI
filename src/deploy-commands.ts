import { DiscordAPIError, REST, Routes } from "discord.js";
import { commands, messageCommands } from "./commands/index.js";
import { config } from "./config.js";

const rest = new REST().setToken(config.token);
const body = [
  ...commands.map((command) => command.data.toJSON()),
  ...messageCommands.map((command) => command.data.toJSON()),
];

if (config.guildIds.length === 0) {
  await rest.put(Routes.applicationCommands(config.clientId), { body });
  console.log(`Registered ${body.length} command(s) globally.`);
} else {
  for (const guildId of config.guildIds) {
    try {
      await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body });
      console.log(`Registered ${body.length} command(s) to guild ${guildId}.`);
    } catch (error) {
      // Keep going so one server the bot isn't in doesn't block the rest.
      const reason = error instanceof DiscordAPIError && error.code === 50001 ? "the bot isn't in that server" : error;
      console.warn(`Skipped guild ${guildId}:`, reason);
      process.exitCode = 1;
    }
  }
}
