/** Honest emergency copy: never promise a 30-minute response when SOS cannot be used. */

export type EmergencySlaCopy = {
  title: string;
  detail: string;
  nextStep: string;
  promiseMinutes: number | null;
};

export function tenantEmergencySlaCopy(input: {
  hasResidence: boolean;
  minutes: number;
  lang: 'en' | 'ar';
}): EmergencySlaCopy {
  const minutes = Number(input.minutes);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
  if (input.hasResidence) {
    return input.lang === 'ar'
      ? {
          title: 'طوارئ؟ اطلب المساعدة الآن',
          detail: `الاستجابة خلال ${safeMinutes} دقيقة بعد إرسال نداء الطوارئ لسكنك المرتبط.`,
          nextStep: 'افتح صفحة الطوارئ لإرسال نداء SOS.',
          promiseMinutes: safeMinutes,
        }
      : {
          title: 'Emergency? Get help now',
          detail: `Response within ${safeMinutes} minutes once SOS is triggered for your linked home.`,
          nextStep: 'Open the emergency page to send an SOS.',
          promiseMinutes: safeMinutes,
        };
  }
  return input.lang === 'ar'
    ? {
        title: 'نداء الطوارئ غير متاح بعد',
        detail: 'لا يمكن لوعد الاستجابة خلال 30 دقيقة لأنه لا يوجد سكن مرتبط بحسابك، لذلك نداء SOS متوقف.',
        nextStep: 'اطلب من إدارة العقار ربط وحدتك، أو اتصل بخدمات الطوارئ مباشرة (999 للشرطة، 998 للدفاع المدني).',
        promiseMinutes: null,
      }
    : {
        title: 'Emergency SOS is not available yet',
        detail: 'We cannot promise a 30-minute response because no home is linked to your account, so SOS is turned off.',
        nextStep: 'Ask property management to link your unit, or call emergency services directly (999 police, 998 civil defence).',
        promiseMinutes: null,
      };
}
