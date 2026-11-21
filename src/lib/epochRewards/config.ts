/**
 * The epoch-rewards switch. It currently gates the header's epoch only; the home
 * headline, the home rewards table and the wallet, calculator and analytics surfaces
 * are not gated yet, so keep it on until they are. Typed `boolean` so neither branch
 * narrows away.
 */
export const EPOCH_REWARDS_ENABLED: boolean = true;
