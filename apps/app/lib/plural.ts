/**
 * "1 client", "2 clients", "1,200 clients": a count with its noun, for
 * subtitles and buttons. English only, like the rest of the interface.
 */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
}
