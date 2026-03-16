const BASE_URL = import.meta.env.VITE_ERPNEXT_URL || '';

function getInitials(name = '') {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

function stringToColor(str) {
  const colors = [
    '#1565c0', '#2e7d32', '#6a1b9a', '#c62828',
    '#ef6c00', '#00695c', '#4527a0', '#283593',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + hash * 31;
  return colors[Math.abs(hash) % colors.length];
}

export default function Avatar({ name = '', image = '', size = 40 }) {
  const initials = getInitials(name);
  const bg = stringToColor(name);

  if (image) {
    const src = image.startsWith('http') || image.startsWith('data:') ? image : `${BASE_URL}${image}`;
    return (
      <img
        src={src}
        alt={name}
        className="avatar-img"
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
        onError={(e) => {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'flex';
        }}
      />
    );
  }

  return (
    <div
      className="avatar-initials"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
