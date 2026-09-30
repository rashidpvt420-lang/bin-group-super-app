// N-28: Firestore IndexedDB persistence is enabled for offline use, but nothing cleared it when a
// user signed out, so tenant / HR / owner documents stayed readable on a shared device and the
// next account on that browser could be served the previous user's cached data.
//
// This watches auth state (covering every sign-out path: portal controls, protected-route
// buttons, Admin terminal, token revocation, account switch) and, when a signed-in user signs
// out or is replaced by a different user, terminates Firestore, clears its offline cache and
// reloads so a fresh Firestore instance starts for the next session.

type AuthUserLike = { uid: string } | null;

export interface OfflineCacheTeardownDeps {
    subscribe: (listener: (user: AuthUserLike) => void) => () => void;
    terminate: () => Promise<void>;
    clearPersistence: () => Promise<void>;
    reload: () => void;
    log?: (message: string, error?: unknown) => void;
}

export function installOfflineCacheTeardown(deps: OfflineCacheTeardownDeps): () => void {
    let previousUid: string | null | undefined; // undefined = first auth callback not seen yet
    let tearingDown = false;
    const log = deps.log || (() => undefined);

    const teardown = async () => {
        if (tearingDown) return;
        tearingDown = true;
        try {
            await deps.terminate();
            await deps.clearPersistence();
        } catch (error) {
            // e.g. another tab still holds the cache. Reloading still drops this tab's in-memory
            // cache; the owning tab clears the persisted cache when it sees the same sign-out.
            log('[Firebase] Offline cache could not be fully cleared after sign-out.', error);
        } finally {
            deps.reload();
        }
    };

    return deps.subscribe((user) => {
        const nextUid = user?.uid || null;
        const signedOutOrSwitched = typeof previousUid === 'string' && nextUid !== previousUid;
        previousUid = nextUid;
        if (signedOutOrSwitched) void teardown();
    });
}
