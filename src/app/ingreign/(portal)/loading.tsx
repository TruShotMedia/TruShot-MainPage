export default function IngreignPortalLoading() {
  return (
    <div className="ingreign-route-loading" role="status" aria-label="Loading INGREIGN page">
      <header className="ingreign-loading-header">
        <div>
          <span className="ingreign-loading-line is-label" />
          <span className="ingreign-loading-line is-title" />
          <span className="ingreign-loading-line is-title is-short" />
        </div>
        <div>
          <span className="ingreign-loading-line" />
          <span className="ingreign-loading-line is-medium" />
        </div>
      </header>
      <section className="ingreign-loading-card">
        <span className="ingreign-loading-line is-label" />
        <div className="ingreign-loading-grid">
          {Array.from({ length: 12 }, (_, index) => <span key={index} />)}
        </div>
      </section>
    </div>
  );
}
