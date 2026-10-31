import pg from "pg";

/**
 * Postgres pool. Connection details come from the standard PGHOST, PGPORT,
 * PGUSER, PGPASSWORD and PGDATABASE environment variables, which pg reads
 * on its own.
 */
export const pool = new pg.Pool();

// An idle client losing its connection (e.g. the server restarting) would
// otherwise crash the bot.
pool.on("error", (error) => console.error("Database connection error:", error));

/** Logs whether the database is reachable. Never throws. */
export async function checkDatabase(): Promise<void> {
  const target = `${process.env.PGUSER}@${process.env.PGHOST}:${process.env.PGPORT ?? 5432}/${process.env.PGDATABASE}`;
  try {
    await pool.query("SELECT 1");
    console.log(`Connected to database ${target}`);
  } catch (error) {
    console.error(`Could not connect to database ${target}:`, error);
  }
}
