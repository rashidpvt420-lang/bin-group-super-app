const svgDataUri = (svg: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const BIN_PROFILE_PHOTO_FALLBACK = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F5D987"/>
      <stop offset="0.5" stop-color="#C6A75E"/>
      <stop offset="1" stop-color="#8F6F2E"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="15%" r="80%">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#020617" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="240" height="240" rx="52" fill="url(#glow)"/>
  <rect x="18" y="18" width="204" height="204" rx="42" fill="none" stroke="url(#gold)" stroke-width="6" opacity="0.9"/>
  <path d="M68 178V84l52-36 52 36v94h-28V98l-24-16-24 16v80H68Z" fill="url(#gold)"/>
  <path d="M101 178v-55h38v55h-38Z" fill="#020617" opacity="0.95"/>
  <text x="120" y="210" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="900" fill="#F5D987">BIN</text>
</svg>`);

const BIN_PROFILE_COVER_FALLBACK = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 520" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#070707"/>
      <stop offset="0.45" stop-color="#151107"/>
      <stop offset="1" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F5D987"/>
      <stop offset="0.5" stop-color="#C6A75E"/>
      <stop offset="1" stop-color="#8F6F2E"/>
    </linearGradient>
    <radialGradient id="shine" cx="22%" cy="18%" r="70%">
      <stop offset="0" stop-color="#F5D987" stop-opacity="0.26"/>
      <stop offset="1" stop-color="#F5D987" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="92" height="92" patternUnits="userSpaceOnUse">
      <path d="M92 0H0V92" fill="none" stroke="#F5D987" stroke-opacity="0.08" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1440" height="520" fill="url(#bg)"/>
  <rect width="1440" height="520" fill="url(#shine)"/>
  <rect width="1440" height="520" fill="url(#grid)"/>
  <g transform="translate(860 42)" opacity="0.18">
    <path d="M110 380V112L250 20l140 92v268h-76V156l-64-42-64 42v224H110Z" fill="url(#gold)"/>
    <path d="M198 380V230h104v150H198Z" fill="#020617" opacity="0.95"/>
  </g>
  <text x="84" y="168" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="900" fill="#F5D987">BIN GROUP</text>
  <text x="84" y="238" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" fill="#FFFFFF" fill-opacity="0.86">Sovereign Property Care Profile</text>
  <text x="84" y="296" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#FFFFFF" fill-opacity="0.58">Verified identity • service history • contract intelligence</text>
</svg>`);

export const pickProfilePhoto = (profileData?: any, user?: any): string => {
  const candidates = [
    profileData?.photoURL,
    profileData?.photoUrl,
    profileData?.profilePhotoURL,
    profileData?.profilePhotoUrl,
    profileData?.profileImageURL,
    profileData?.profileImageUrl,
    profileData?.avatarURL,
    profileData?.avatarUrl,
    user?.photoURL,
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || BIN_PROFILE_PHOTO_FALLBACK;
};

export const pickProfileCover = (profileData?: any, user?: any): string => {
  const candidates = [
    profileData?.coverPhotoURL,
    profileData?.coverPhotoUrl,
    profileData?.coverImageURL,
    profileData?.coverImageUrl,
    profileData?.backgroundPhotoURL,
    profileData?.backgroundPhotoUrl,
    profileData?.backgroundImageURL,
    profileData?.backgroundImageUrl,
    profileData?.profileBackgroundURL,
    profileData?.profileBackgroundUrl,
    profileData?.profileCoverURL,
    profileData?.profileCoverUrl,
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || BIN_PROFILE_COVER_FALLBACK;
};

export const profileCoverSx = (coverUrl?: string) => ({
  position: 'relative' as const,
  overflow: 'hidden' as const,
  background: coverUrl
    ? `linear-gradient(135deg, rgba(2, 6, 23, 0.5), rgba(2, 6, 23, 0.88)), url("${coverUrl}") center/cover no-repeat`
    : `linear-gradient(135deg, rgba(2, 6, 23, 0.5), rgba(2, 6, 23, 0.88)), url("${BIN_PROFILE_COVER_FALLBACK}") center/cover no-repeat`,
  '&::before': {
    content: '""',
    position: 'absolute' as const,
    inset: 0,
    background: 'linear-gradient(135deg, rgba(255,255,255,0.08), transparent 42%, rgba(198,167,94,0.14))',
    pointerEvents: 'none' as const,
  },
  '&::after': {
    content: '"BIN GROUP"',
    position: 'absolute' as const,
    right: 24,
    bottom: 18,
    fontSize: { xs: 38, md: 58 },
    fontWeight: 950,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.055)',
    pointerEvents: 'none' as const,
  },
  '& > *': {
    position: 'relative' as const,
    zIndex: 1,
  },
});