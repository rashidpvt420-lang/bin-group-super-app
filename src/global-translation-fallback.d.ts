declare const t: (key: string, variables?: Record<string, unknown>) => string;

interface Window {
  t?: (key: string, variables?: Record<string, unknown>) => string;
}
