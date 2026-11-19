/** Whether the signed-in person may do something, for showing or hiding controls (the server still checks). */
import { type Action, authorize as checkPolicy, type Resource } from "@dueproof/core";
import type { AuthContext } from "./authorize";

/** True when the person may see this client (client-level access, Settings → Team). */
export { clientAllowed as inScope } from "./client-access";

export function may(ctx: AuthContext, action: Action, resource?: Resource): boolean {
  try {
    checkPolicy(ctx, action, resource);
    return true;
  } catch {
    return false;
  }
}
