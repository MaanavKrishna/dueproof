import { describe, expect, it } from "vitest";
import { createDatabase, dbConfigFromEnv, unsafeRawDb } from "./client";
import { rowsOf } from "./migrate";
import { OrgScopeError, withOrg } from "./tenant";

/**
 * The hosted driver (Neon's serverless Pool) and the self-hosted one
 * (postgres-js) can't reach a database in the unit tests, so this checks
 * what can be checked without one: the configuration each edition reads,
 * that the clients are built lazily (no connection until the first query,
 * which matters on a cold serverless start), and the result shapes the
 * migrator reads.
 */
describe("database configuration from the environment", () => {
  it("is PGlite with no DATABASE_URL, Postgres with one, Neon when asked", () => {
    expect(dbConfigFromEnv({})).toEqual({ driver: "pglite", dataDir: undefined });
    expect(dbConfigFromEnv({ PGLITE_DATA_DIR: "/data/pglite" })).toEqual({
      driver: "pglite",
      dataDir: "/data/pglite",
    });
    expect(dbConfigFromEnv({ DATABASE_URL: "postgres://u:p@db:5432/dueproof" })).toEqual({
      driver: "postgres",
      url: "postgres://u:p@db:5432/dueproof",
    });
    expect(
      dbConfigFromEnv({
        DATABASE_DRIVER: "neon",
        DATABASE_URL: "postgresql://owner:pw@ep-calm-sea.ap-southeast-1.aws.neon.tech/dueproof",
      }),
    ).toEqual({
      driver: "neon",
      url: "postgresql://owner:pw@ep-calm-sea.ap-southeast-1.aws.neon.tech/dueproof",
    });
  });

  it("refuses Neon or Postgres without a URL, and unknown drivers, naming no secret", () => {
    expect(() => dbConfigFromEnv({ DATABASE_DRIVER: "neon" })).toThrow(/DATABASE_URL is required/);
    expect(() => dbConfigFromEnv({ DATABASE_DRIVER: "postgres" })).toThrow(/DATABASE_URL/);
    expect(() =>
      dbConfigFromEnv({ DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://u:secret@h/db" }),
    ).toThrow(/unknown DATABASE_DRIVER: mysql$/);
  });
});

describe("the Neon and postgres-js clients", () => {
  for (const driver of ["neon", "postgres"] as const) {
    it(`${driver}: builds without connecting, switches to the app role, and closes`, async () => {
      // Port 1 on localhost: any attempt to connect would fail loudly.
      const database = await createDatabase({
        driver,
        url: "postgresql://owner:pw@127.0.0.1:1/dueproof",
      });
      expect(database.driver).toBe(driver);
      expect(database.appRole).toBe("dueproof_app");
      expect(Object.isFrozen(database)).toBe(true);
      expect(typeof unsafeRawDb(database).transaction).toBe("function");
      // The org id is checked before any connection is made.
      await expect(withOrg(database, "x'; drop table audit; --", async () => 1)).rejects.toThrow(
        OrgScopeError,
      );
      await database.close();
    });
  }

  it("lets a deployment opt out of the role switch only explicitly", async () => {
    const database = await createDatabase(
      { driver: "neon", url: "postgresql://app:pw@127.0.0.1:1/dueproof" },
      { appRole: null },
    );
    expect(database.appRole).toBeNull();
    await database.close();
  });
});

describe("query results", () => {
  it("are read the same from every driver", () => {
    // postgres-js: an array; PGlite, Neon and node-postgres: { rows }.
    expect(rowsOf<{ n: number }>([{ n: 1 }])).toEqual([{ n: 1 }]);
    expect(rowsOf<{ n: number }>({ rows: [{ n: 2 }], rowCount: 1 })).toEqual([{ n: 2 }]);
    expect(rowsOf(null)).toEqual([]);
    expect(rowsOf({})).toEqual([]);
  });
});
