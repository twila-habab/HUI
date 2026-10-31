# A lunch break experiment.

This Discord bot is me experimenting with Claude Code's capabilities. The core functionalities finished within 10-15 minutes of my lunch break.

It has since grown into a general fun bot for a few friend servers: receipts, levels, jokes, matchmaking and more. Run `/help` in Discord for the full list.

## Features

### 🧾 Receipts
- **Receipt this** / **Receipt multiple** (right-click a message → Apps): screenshot one or more messages as an image that looks like Discord, and post it to the server's receipts channel. Whoever made a receipt can delete it.
- **`/repost`**: repost a random receipt into the current channel.
- **Daily receipt**: a random receipt is posted into the anon general channel every day at 00:00 UTC.
- **`/reindex`** (admins): rebuild the list `/repost` picks from.

### 📈 Levels
- Members earn 15–25 XP per message, at most once a minute, tracked per server. Each level takes a bit more XP than the last, and level-ups are announced in the channel.
- **`/rank [user]`**: a rank card with avatar, level, server position and a progress bar in the member's role colour.
- **`/leaderboard`**: the server's top 10.

### 🎉 Fun
- **`/ship user [with]`**: a love score for two people, with a picture and a cringy verdict. The same pair always gets the same score.
- **`/roast user [spicy]`**: a random roast. `spicy:True` picks meaner ones, which stay about habits, never identity or looks.
- **`/wanted [user]`**: a Wild West wanted poster whose bounty grows with level XP.
- **Rate this** (right-click a message → Apps): a fixed 0–10 rating for any post, text or image.
- **`/jokes [category]`**: a joke from [JokeAPI](https://jokeapi.dev). Dark jokes only appear when chosen explicitly.
- **Daily joke**: every general channel gets a joke at midnight local time (`TZ`).

### 😀 Emoji relay
Chosen members (`EMOJI_RELAY_USER_IDS`) can use emojis from any server the bot is in, including animated ones, without Nitro. They type `:name:`, and the bot reposts their message through a webhook as "*Name*'s Nitro" with the real emojis, then deletes the original.

### 🛠️ Utility
- **`/help`**: every command, grouped by section (only you see it).
- **`/ping`**, **`/echo message`**

## Running it locally

Needs Node.js 24 and a Postgres database (for levels).

1. Install dependencies:
   ```sh
   npm install
   ```
2. Copy `.env.example` to `.env` and fill it in. Every variable is explained in that file. The essentials are:
   - `DISCORD_TOKEN` and `CLIENT_ID` from the [Developer Portal](https://discord.com/developers/applications)
   - `GUILD_ID`: your test server's ID, so commands update instantly
   - `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

   Use a separate dev bot for testing. Two copies of the bot on the same token will both answer everything.
3. For a throwaway local database, Docker works well:
   ```sh
   docker run -d --name discord-bot-pg -p 5433:5432 \
     -e POSTGRES_USER=discord_bot -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=discord_bot \
     postgres:18
   ```
   Then set `PGHOST=localhost`, `PGPORT=5433`, and the user, password and database to `discord_bot` / `devpassword` / `discord_bot`. The bot creates its `levels` table on startup.
4. Register the slash commands. Rerun this whenever a command is added or its options change:
   ```sh
   npm run register
   ```
5. Start the bot. It restarts on changes:
   ```sh
   npm run dev
   ```
   On startup it logs whether it reached the database (`Connected to database …`).

`npm run typecheck` checks types. `npm run build` and `npm start` run the compiled version.

## Discord setup

- **Privileged intent:** turn on **Message Content** under Bot in the Developer Portal.
- **Permissions:** View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Use External Emojis, Manage Messages and Manage Webhooks. The last two are for the emoji relay and deleting receipts.
- For the emoji relay to show external emojis, the server's `@everyone` role needs **Use External Emojis** in that channel.
- A server the bot is in only to provide emojis needs no permissions at all.

## Project layout

```
src/
  index.ts            entry point: client, intents, event wiring
  config.ts           environment variables
  db.ts               Postgres pool and startup check
  commands/           one file per slash / right-click command
  levels.ts           XP, levels and leaderboard queries
  emojiRelay.ts       emoji relay
  repost.ts           receipts index, /repost and the daily receipt
  dailyJoke.ts        daily joke
  receiptImage.ts     receipt screenshots
  rankCard.ts         /rank card
  shipImage.ts        /ship picture
  wantedImage.ts      /wanted poster
  deploy-commands.ts  npm run register
```
