/**
 * Serves local-disk signed URLs: GET (download) and PUT (upload) with an
 * HMAC token bound to one key, one method, a size cap and ≤ 5 minutes.
 * The token is the authorisation (no session: the engine calls this too),
 * so this route doesn't call authorize(); the token was minted by code that
 * did.
 */
import { handleLocalStorageRequest, LocalDiskStorage } from "@dueproof/storage";
import { getContainer } from "@/lib/server/container";

export const runtime = "nodejs";

async function handle(request: Request): Promise<Response> {
  const { storage } = await getContainer();
  if (!(storage instanceof LocalDiskStorage)) return new Response("not found", { status: 404 });
  return handleLocalStorageRequest(storage, request);
}

export { handle as GET, handle as PUT };
