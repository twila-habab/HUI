import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { commands, messageCommands } from "./commands/index.js";
import { config } from "./config.js";
import { setupRepost } from "./repost.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // Privileged: must also be enabled in the Developer Portal (Bot tab).
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  setupRepost(readyClient).catch((error) => console.error("Repost setup failed:", error));
});

client.on(Events.InteractionCreate, async (interaction) => {
  let run: (() => Promise<void>) | undefined;
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (command) run = () => command.execute(interaction);
  } else if (interaction.isMessageContextMenuCommand()) {
    const command = messageCommands.get(interaction.commandName);
    if (command) run = () => command.execute(interaction);
  } else {
    return;
  }
  if (!run) return;

  try {
    await run();
  } catch (error) {
    console.error(`Error running /${interaction.commandName}:`, error);
    const reply = {
      content: "Something went wrong running that command.",
      flags: MessageFlags.Ephemeral,
    } as const;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

await client.login(config.token);
