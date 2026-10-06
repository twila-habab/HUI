import { REST, Routes } from "discord.js";
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
    await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body });
    console.log(`Registered ${body.length} command(s) to guild ${guildId}.`);
  }
}
