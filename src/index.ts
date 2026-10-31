import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { commands, messageCommands } from "./commands/index.js";
import { deleteReceipt, isReceiptDeleteButton } from "./commands/receipt.js";
import { config } from "./config.js";
import { setupDailyJoke } from "./dailyJoke.js";
import { checkDatabase } from "./db.js";
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
  setupDailyJoke(readyClient).catch((error) => console.error("Daily joke setup failed:", error));
});

client.on(Events.InteractionCreate, async (interaction) => {
  let run: (() => Promise<void>) | undefined;
  let name: string;
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (command) run = () => command.execute(interaction);
    name = `/${interaction.commandName}`;
  } else if (interaction.isMessageContextMenuCommand()) {
    const command = messageCommands.get(interaction.commandName);
    if (command) run = () => command.execute(interaction);
    name = interaction.commandName;
  } else if (interaction.isButton() && isReceiptDeleteButton(interaction)) {
    run = () => deleteReceipt(interaction);
    name = "receipt delete button";
  } else {
    return;
  }
  if (!run) return;

  try {
    await run();
  } catch (error) {
    console.error(`Error running ${name}:`, error);
    const reply = {
      content: "Something went wrong.",
      flags: MessageFlags.Ephemeral,
    } as const;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

await checkDatabase();
await client.login(config.token);
