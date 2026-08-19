export default function AdminPageLoading() {
  return <div className="admin-page-loading" role="status" aria-label="Loading page">
    <div className="loading-copy"><span /><strong /><i /></div>
    <div className="loading-metrics">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
    <div className="loading-panel" />
  </div>;
}
