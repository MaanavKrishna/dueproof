/** Errors that carry an HTTP status and a message safe to show (no document text, no secrets). */
export class HttpError extends Error {
  override name = "HttpError";
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = "error",
  ) {
    super(message);
  }
}

export const unauthorised = () => new HttpError(401, "Sign in to continue.", "unauthorised");
export const forbidden = (message = "You don't have permission to do that.") =>
  new HttpError(403, message, "forbidden");
export const notFound = (what = "That item") =>
  new HttpError(404, `${what} wasn't found.`, "not_found");
export const badRequest = (message: string, code = "bad_request") =>
  new HttpError(400, message, code);

/** Turn any thrown value into a JSON response. Unknown errors become a plain 500. */
export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    const retryAfter = (e as { retryAfterSeconds?: number }).retryAfterSeconds;
    return Response.json(
      { error: e.code, message: e.message },
      {
        status: e.status,
        ...(retryAfter ? { headers: { "retry-after": String(retryAfter) } } : {}),
      },
    );
  }
  // Production logs only the error's name (messages can quote input); development shows the stack.
  if (process.env.NODE_ENV === "production")
    console.error("unhandled error", e instanceof Error ? e.name : typeof e);
  else console.error("unhandled error", e);
  return Response.json({ error: "internal", message: "Something went wrong." }, { status: 500 });
}
