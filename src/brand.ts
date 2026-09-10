// Source: samgamam/src/app/globals.css and public/images/logo.png.
export const brand = {
  canvas: '#FAF8F5', surface: '#FFFFFF', mutedSurface: '#F2EFE9',
  primary: '#227F6D', primaryStrong: '#176758', primarySoft: 'rgba(34,127,109,0.08)',
  accent: '#C96E4E', accentStrong: '#AB5A3D',
  ink: '#141D2B', text: '#2D3748', muted: '#5A6678',
  border: 'rgba(20,29,43,0.10)', danger: '#C04646',
  fonts: { body: 'Manrope_400Regular', medium: 'Manrope_600SemiBold', bold: 'Manrope_700Bold', display: 'Outfit_600SemiBold' },
  logo: require('../assets/brand/samgamam-logo.png'),
  community: require('../assets/brand/community.png'),
  caption: 'Moments we share',
} as const;
