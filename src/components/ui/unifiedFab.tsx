import { createContext, useContext } from 'react';

/** True when the shell renders the single ActionFab; legacy launchers then hide their own buttons. */
export const UnifiedFabContext = createContext(false);
export const useUnifiedFab = () => useContext(UnifiedFabContext);

export type FabEvent = 'bin:open-ai' | 'bin:open-chat';
export const emitFabEvent = (name: FabEvent) => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(name)); };
