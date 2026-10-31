import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";

// Affectionate roasts about online habits, never about who someone is.
const ROASTS = [
  "your search history is just \"how to sound smart in Discord\".",
  "you've been \"about to go to bed\" for 4 hours.",
  "you type \"lol\" with a completely straight face.",
  "your takes are so cold they need a jacket.",
  "you're the reason group chats have a mute button.",
  "you have the rizz of a wet paper towel.",
  "even your WiFi disconnects to get away from you.",
  "you'd lose a debate to a loading screen.",
  "you say \"brb\" and come back three business days later.",
  "your playlist is 90% songs you skip.",
  "you're not lazy, you're on energy-saving mode. Permanently.",
  "your selfies have more filters than a water treatment plant.",
  "you reply \"k\" and think that's a conversation.",
  "you've been typing for five minutes and it's going to be \"ok\".",
  "you peaked in a Minecraft server in 2014.",
  "your brain has too many tabs open and they're all playing music.",
  "you read the terms and conditions for fun and still got scammed.",
  "you start every story with \"so basically\" and it's never basic.",
  "you have main character energy in a background-character body.",
  "you'd get lost in a straight hallway with a map.",
  "your sleep schedule is a war crime.",
  "you laugh at your own jokes first so nobody else has to.",
  "you'd forget your own birthday if Discord didn't tell you.",
  "your notifications are on for everything and you still miss the important stuff.",
  "you have 47 unread DMs and a \"busy\" status that's lying.",
  "you clap when the plane lands.",
  "you still say \"yeet\" unironically.",
  "you open the fridge every 10 minutes hoping something new appeared.",
  "you narrate your life in your head and even the audience left.",
  "you use light mode. Need I say more?",
  "you send voice messages longer than a podcast episode.",
  "your camera roll is 3,000 screenshots you'll never look at again.",
  "you'd lose a staring contest to a goldfish.",
  "you have the attention span of a— oh look, a notification.",
  "you think \"ratio\" is a personality.",
  "you've pressed \"remind me later\" on every update since 2019.",
  "you got a participation trophy and still came second.",
  "you leave the volume on an odd number on purpose.",
  "you say \"I'm built different\" and you're really not.",
  "you've rewatched the same show six times and still miss the plot.",
];

// Meaner, for /roast spicy:true. Still about habits and brain cells only:
// no slurs, nothing about identity, bodies or looks, nothing about self-harm.
const SPICY_ROASTS = [
  "you're the human version of a participation trophy.",
  "if you were any more forgettable, you'd be a password.",
  "I'd agree with you, but then we'd both be wrong.",
  "you bring everyone so much joy... when you log off.",
  "you're proof that evolution takes the occasional day off.",
  "you're like a cloud: when you disappear, it's a beautiful day.",
  "I'd explain it to you, but I left my crayons at home.",
  "you're not stupid, you just have really bad luck when thinking.",
  "your secrets are safe with me. I never listen when you talk.",
  "you're the reason shampoo bottles have instructions.",
  "you have a whole life to be an idiot. Take a day off.",
  "if ignorance is bliss, you must be the happiest person alive.",
  "you're the human equivalent of a typo.",
  "you're like a software update: every time I see you, I think \"not now\".",
  "everyone has a purpose. Yours is being a warning to others.",
  "your personality is a loading screen with no game after it.",
  "I've met NPCs with more depth than you.",
  "you're the plot hole in everyone's story.",
  "you're the grey sprinkle on a rainbow cupcake.",
  "your hot takes have the shelf life of milk left in the sun.",
  "if brains were WiFi, you'd have one bar in a basement.",
  "even autocorrect has given up on you.",
  "you're the reason aliens drive past Earth without stopping.",
  "you're the friend people mute but never remove, out of pity.",
  "you're not the main character. You're not even in the credits.",
  "you have the energy of a group project where nobody replies.",
  "the bar was on the floor and you brought a shovel.",
  "your opinions are like a broken pencil: pointless.",
  "you're living proof that some people should come with a skip button.",
  "if common sense were a currency, you'd be in debt.",
];

const INTROS = ["🔥", "💀", "🚑", "🧯", "😭", "☠️"];
const SPICY_INTROS = ["🌶️", "🌶️🌶️", "🌶️🔥", "🚨🌶️"];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export const roast: Command = {
  data: new SlashCommandBuilder()
    .setName("roast")
    .setDescription("Lovingly destroy someone 🔥")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) => option.setName("user").setDescription("Who to roast").setRequired(true))
    .addBooleanOption((option) => option.setName("spicy").setDescription("Unleash the mean ones 🌶️")),
  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const spicy = interaction.options.getBoolean("spicy") ?? false;
    const roasts = spicy ? SPICY_ROASTS : ROASTS;
    let content: string;
    if (user.id === interaction.client.user.id) {
      content = spicy
        ? "🌶️ You tried to spicy-roast a bot. You're arguing with code. Let that sink in."
        : "🪞 Roast me? I'm a bot running on someone's free time. I roast myself every time I crash.";
    } else if (user.id === interaction.user.id) {
      content = `🤡 <@${user.id}> roasted themselves. Honestly, ${pick(roasts)}`;
    } else {
      content = `${pick(spicy ? SPICY_INTROS : INTROS)} <@${user.id}>, ${pick(roasts)}`;
    }
    // Ping the target so they can see they've been roasted.
    await interaction.reply({ content, allowedMentions: { users: [user.id] } });
  },
};
