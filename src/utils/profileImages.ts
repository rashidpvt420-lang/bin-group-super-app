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

  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || '';
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
    pickProfilePhoto(profileData, user),
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || '';
};

export const profileCoverSx = (coverUrl?: string) => ({
  position: 'relative' as const,
  overflow: 'hidden' as const,
  background: coverUrl
    ? `linear-gradient(135deg, rgba(2, 6, 23, 0.62), rgba(2, 6, 23, 0.9)), url("${coverUrl}") center/cover no-repeat`
    : 'radial-gradient(circle at 18% 0%, rgba(198,167,94,0.28), transparent 30%), linear-gradient(135deg, rgba(198,167,94,0.16), rgba(255,255,255,0.03) 45%, rgba(2,6,23,0.92))',
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
