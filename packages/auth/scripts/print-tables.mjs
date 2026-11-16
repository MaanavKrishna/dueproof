// Prints the tables and fields Better Auth expects for our plugin set, to
// compare against packages/db/src/auth-schema.ts after upgrading Better Auth
// or changing plugins. `pnpm --filter @dueproof/auth auth:tables`
import { passkey } from "@better-auth/passkey";
import { getAuthTables } from "better-auth/db";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";

const tables = getAuthTables({
  rateLimit: { storage: "database", enabled: true },
  plugins: [
    organization({
      schema: {
        member: {
          additionalFields: {
            mayApproveReplies: { type: "boolean", required: false, defaultValue: false },
          },
        },
      },
    }),
    twoFactor(),
    passkey(),
  ],
});
for (const [model, table] of Object.entries(tables)) {
  console.log(`\n${model}`);
  for (const [field, attr] of Object.entries(table.fields)) {
    const ref = attr.references ? ` -> ${attr.references.model}.${attr.references.field}` : "";
    console.log(
      `  ${field}: ${attr.type}${attr.required ? "" : "?"}${attr.unique ? " unique" : ""}${ref}`,
    );
  }
}
