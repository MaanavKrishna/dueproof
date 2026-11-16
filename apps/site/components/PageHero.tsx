export function PageHero({
  overline,
  title,
  children,
}: {
  overline: string;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="page-hero">
      <div className="wrap">
        <p className="overline">{overline}</p>
        <h1 className="display">{title}</h1>
        {children && <div className="lede">{children}</div>}
      </div>
    </section>
  );
}
