import './RoleContext';

declare module './RoleContext' {
  interface SovereignUser {
    [key: string]: unknown;
  }
}
