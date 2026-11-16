// `pnpm --filter @dueproof/db db:migrate` — apply migrations and rls.sql to
// the database named by DATABASE_DRIVER / DATABASE_URL / PGLITE_DATA_DIR.
import { createDatabase, dbConfigFromEnv, migrate } from "../src/index";

const config = dbConfigFromEnv(process.env);
const database = await createDatabase(config);
try {
  const { applied } = await migrate(database);
  console.log(applied.length ? `applied: ${applied.join(", ")}` : "up to date");
} finally {
  await database.close();
}
