# Network fixtures

Raw responses recorded on 2026-11-06 (about 02:30 UTC) from the endpoints the Network page already reads. Aggregate public data, no addresses. They are test inputs only and are never refreshed automatically.

| File                      | Request                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| epochs.json               | GET https://api.voirewards.com/proposers/index_main_3.php?action=epoch-detail (106 epochs, current_epoch 106, includes participating_wallets) |
| online-stake-history.json | GET https://api.voirewards.com/proposers/index_main_3.php?action=online-stake-history (31 daily rows; avg_online_stake is in micro-VOI)       |
| price-history-7d.json     | GET https://voirewards.com/api/price-history?period=7d (168 hourly rows; time is integer seconds)                                             |
| tx-counts-day-30.json     | GET https://voirewards.com/api/mimir?action=get_tx_counts&p_period=day&p_n=30                                                                 |
