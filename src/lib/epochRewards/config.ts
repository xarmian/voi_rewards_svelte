/**
 * The epoch-rewards switch. It gates the header's epoch, the home page's epoch surfaces
 * (the APR headline and chart, the epoch tiles, the APR lede, the rewards table) and the
 * wallet's (the Overview's epoch card and chart, the contracts' blocks-this-epoch column,
 * the Rewards tab's epoch table and recorded payouts chart), the calculator's (the node
 * cost field, the estimate tiles, the reward schedule and its CSV, on the wallet tab and
 * /calculator) and the node panel's (the ~VOI figures and the APR row), with the reads
 * behind them. The analytics surfaces are not gated yet, so keep it on until they are.
 * Typed `boolean` so neither branch narrows away.
 */
export const EPOCH_REWARDS_ENABLED: boolean = true;
