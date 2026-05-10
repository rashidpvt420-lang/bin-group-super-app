declare module 'stylis';
declare module 'papaparse';

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

interface ImportMetaEnv {
    readonly VITE_FIREBASE_PROJECT_ID: string;
    readonly VITE_GOOGLE_MAPS_API_KEY: string;
    readonly VITE_FIREBASE_VAPID_KEY: string;
}
