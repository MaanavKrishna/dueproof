/**
 * Boot: validate the environment (fail fast, naming variables, never
 * values), open the database and run migrations, and start the Workflow
 * World's worker when it has one (the Postgres World on self-hosted).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getEnv } = await import("./lib/env");
  getEnv();

  const { getContainer } = await import("./lib/server/container");
  await getContainer();

  if (process.env.WORKFLOW_TARGET_WORLD === "@workflow/world-postgres") {
    const { getWorld } = await import("workflow/runtime");
    const world = await getWorld();
    await world.start?.();
  }
}
