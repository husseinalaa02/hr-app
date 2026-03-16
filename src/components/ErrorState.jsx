export default function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="error-state">
      <div className="error-icon">⚠</div>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-primary" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
