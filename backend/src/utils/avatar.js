export const generateAvatar = (name) => {
  const seed = String(name || '').trim().toLowerCase();
  
  // Slate/amber premium color combos
  const bgColors = [
    '#2d1d14', // Dark amber/brown (matches user screenshot)
    '#1e293b', // Slate
    '#1e3a8a', // Dark Blue
    '#581c87', // Dark Purple
    '#064e3b', // Dark Emerald
    '#4c0519', // Dark Rose
    '#1c1917', // Dark Stone
    '#14532d', // Forest green
    '#311042', // Plum
  ];
  
  const iconColors = [
    '#e2b189', // Peach/gold tint (matches user screenshot)
    '#cbd5e1', // Slate light
    '#93c5fd', // Blue light
    '#c084fc', // Purple light
    '#6ee7b7', // Emerald light
    '#fda4af', // Rose light
    '#d6d3d1', // Stone light
    '#86efac', // Green light
    '#f472b6', // Pink light
  ];

  // Simple string hashing
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % bgColors.length;
  
  const bgColor = bgColors[idx];
  const iconColor = iconColors[idx];
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="50" fill="${bgColor}"/>
    <circle cx="50" cy="38" r="14" fill="${iconColor}"/>
    <path d="M22,76 C22,61 32,52 50,52 C68,52 78,61 78,76 Z" fill="${iconColor}"/>
  </svg>`;
  
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const formatUser = (user) => {
  if (!user) return null;
  return {
    ...user,
    avatar: generateAvatar(user.name)
  };
};
