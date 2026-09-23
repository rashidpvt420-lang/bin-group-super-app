export type OwnerReviewQuote = {
    quoteHash: string;
    expiresAtMs: number;
};

export function canContinueOwnerReview(input: {
    authReady: boolean;
    quoteLoading: boolean;
    quoteError: string;
    signedInUid: string | null;
    ownerUid: string | undefined;
    quote: OwnerReviewQuote | null | undefined;
    quoteRequestKey: string;
    persistedQuoteRequestKey: string | null | undefined;
    verifiedQuoteKey: string | null;
    allPropertyPinsSaved: boolean;
    nowMs: number;
}): boolean {
    const { authReady, quoteLoading, quoteError, signedInUid, ownerUid, quote,
        quoteRequestKey, persistedQuoteRequestKey, verifiedQuoteKey, allPropertyPinsSaved, nowMs } = input;
    return authReady && !quoteLoading && !quoteError && !!ownerUid && signedInUid === ownerUid
        && !!quote?.quoteHash && quote.expiresAtMs > nowMs
        && persistedQuoteRequestKey === quoteRequestKey
        && verifiedQuoteKey === `${quoteRequestKey}:${quote.quoteHash}`
        && allPropertyPinsSaved;
}
