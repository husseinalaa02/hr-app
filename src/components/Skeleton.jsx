export function Skeleton({ width = '100%', height = 18, radius = 4, style = {} }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <Skeleton width={56} height={56} radius={50} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton width="60%" height={16} />
        <Skeleton width="40%" height={12} />
        <Skeleton width="50%" height={12} />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
      <Skeleton width="20%" height={14} />
      <Skeleton width="25%" height={14} />
      <Skeleton width="15%" height={14} />
      <Skeleton width="15%" height={14} />
      <Skeleton width="12%" height={22} radius={12} />
    </div>
  );
}
