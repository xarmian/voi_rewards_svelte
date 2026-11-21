/**
 * The epoch-rewards switch. It gates every epoch surface, with the reads behind them: the
 * header's epoch, the home page's (the APR headline and chart, the epoch tiles, the APR
 * lede, the rewards table), the wallet's (the Overview's epoch card and chart, the
 * contracts' blocks-this-epoch column, the Rewards tab's epoch table and recorded payouts
 * chart), the calculator's (the node cost field, the estimate tiles, the reward schedule
 * and its CSV, on the wallet tab and /calculator), the node panel's (the ~VOI figures and
 * the APR row), the analytics page's (the lede, the APR and accounts-earning charts, the
 * stake split) and the design gallery's epoch stepper.
 * Typed `boolean` so neither branch narrows away.
 */
export const EPOCH_REWARDS_ENABLED: boolean = true;
