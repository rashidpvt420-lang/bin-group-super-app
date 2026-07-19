const DEVICE_ID_KEY = 'bin_technician_device_id_v1';

export type TechnicianDevicePlatform = 'android' | 'ios' | 'unsupported';

export type TechnicianDeviceIdentity = {
  deviceId: string;
  platform: TechnicianDevicePlatform;
  physicalMobile: boolean;
};

const detectPlatform = (): TechnicianDevicePlatform => {
  if (typeof navigator === 'undefined') return 'unsupported';
  const ua = String(navigator.userAgent || '');
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'unsupported';
};

const createDeviceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tech_${crypto.randomUUID().replaceAll('-', '')}`;
  }
  const random = Math.random().toString(36).slice(2);
  return `tech_${Date.now().toString(36)}_${random}`;
};

export const getTechnicianDeviceIdentity = (): TechnicianDeviceIdentity => {
  const platform = detectPlatform();
  let deviceId = '';
  try {
    deviceId = String(localStorage.getItem(DEVICE_ID_KEY) || '').trim();
    if (!/^[A-Za-z0-9_-]{16,180}$/.test(deviceId)) {
      deviceId = createDeviceId();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  } catch {
    deviceId = createDeviceId();
  }
  return {
    deviceId,
    platform,
    physicalMobile: platform === 'android' || platform === 'ios',
  };
};
