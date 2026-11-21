/**
 * The epoch-rewards switch. It gates the header's epoch and the home page's epoch
 * surfaces: the APR headline and chart, the epoch tiles, the APR lede, the rewards table
 * and the reads behind them. The wallet, calculator and analytics surfaces are not gated
 * yet, so keep it on until they are. Typed `boolean` so neither branch narrows away.
 */
export const EPOCH_REWARDS_ENABLED: boolean = true;
