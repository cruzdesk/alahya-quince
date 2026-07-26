require("dotenv").config();
const { Client } = require("pg");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Falta DATABASE_URL");
    process.exit(1);
  }
  const c = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const beforeR = await c.query("SELECT COUNT(*)::int AS n FROM reservations");
  const beforeW = await c.query("SELECT COUNT(*)::int AS n FROM wishes");
  console.log("antes reservas=", beforeR.rows[0].n, "deseos=", beforeW.rows[0].n);

  const r = await c.query("DELETE FROM reservations");
  const w = await c.query("DELETE FROM wishes");

  try {
    await c.query("ALTER SEQUENCE reservations_id_seq RESTART WITH 1");
  } catch (_) {}
  try {
    await c.query("ALTER SEQUENCE wishes_id_seq RESTART WITH 1");
  } catch (_) {}

  const afterR = await c.query("SELECT COUNT(*)::int AS n FROM reservations");
  const afterW = await c.query("SELECT COUNT(*)::int AS n FROM wishes");
  console.log("borradas reservas=", r.rowCount, "deseos=", w.rowCount);
  console.log("despues reservas=", afterR.rows[0].n, "deseos=", afterW.rows[0].n);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
