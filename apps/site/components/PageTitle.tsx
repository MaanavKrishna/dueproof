export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="page-title cloth">
      <div className="wrap">
        <h1>{title}</h1>
        {children && <div className="lede">{children}</div>}
      </div>
    </section>
  );
}
