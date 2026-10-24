import { asset } from "@/lib/site";

/** A screenshot of the running app, with what to look at in the caption. */
export function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="figure">
      <img src={asset(`/docs-images/${src}`)} alt={alt} width={1440} height={900} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
