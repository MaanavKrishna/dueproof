/** Page helper: a loader's 400/404 becomes Next's not-found page rather than an error. */
import "server-only";
import { notFound } from "next/navigation";
import { HttpError } from "@/lib/errors";

export async function orNotFound<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
}

export const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;
