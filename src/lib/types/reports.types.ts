export interface MarketSnapshot {
	voi_price_usd: string;
	market_cap_usd: string;
	avg_block_time_seconds: string;
}

export interface NetworkNodes {
	participating_nodes_or_wallets: string;
	eligible_online_stake_voi: string;
	weekly_staking_rewards_voi: string;
	insight: string;
}

export interface RelayHealth {
	total_relays: string;
	qualified_relays: string;
	relays_added: string;
	relays_removed: string;
	total_possible_peers: string;
	key_takeaway: string;
	operational_note: string;
}

export interface TransactionAnalysis {
	community_produced_blocks: string;
	round_range_start: string;
	round_range_end: string;
	number_of_blocks: string;
	start_timestamp_utc: string;
	end_timestamp_utc: string;
}

export interface Profitability {
	self_hosted_node_cost_usd: string;
	stake_required_voi: string;
	estimated_monthly_profit_usd: string;
	node_as_a_service_fee_percent: string;
	estimated_monthly_profit_after_fee_usd: string;
	key_takeaway: string;
}

export interface TransactionBreakdown {
	payment_pay: string;
	application_call_appl: string;
	asset_transfer_axfer: string;
	asset_config_acfg: string;
	asset_freeze_afrz: string;
	application_create: string;
	application_update: string;
	application_delete: string;
	inner_transactions: string;
}

export interface RelayToNodeRatio {
	avg_peers_per_relay: string;
	node_to_relay_ratio: string;
	reward_per_peer_voi: string;
	key_takeaway: string;
}

export interface NetworkSummary {
	network_stability: string;
	participation_trend: string;
	transaction_activity: string;
	immediate_risks: string;
}

export interface NetworkData {
	market_snapshot: MarketSnapshot;
	network_nodes: NetworkNodes;
	relay_health_changes: RelayHealth;
	transaction_analysis_overview: TransactionAnalysis;
	profitability_at_a_glance: Profitability;
	transaction_breakdown: TransactionBreakdown;
	relay_to_node_ratio: RelayToNodeRatio;
	weekly_observations: { observations: string };
	data_availability_limitations: { notes: string };
	summary: NetworkSummary;
}

export interface GrantsSnapshot {
	total_proposals_tracked: string;
	new_submissions: string;
	under_review: string;
	approved: string;
	funded: string;
}

export interface GrantEntry {
	proposal_name: string;
	submitted_by: string;
	date_submitted: string;
	assigned_to: string;
	proposal_status: string;
}

export interface GrantsData {
	monthly_snapshot: GrantsSnapshot;
	grants_submitted_in_progress: GrantEntry[];
	highlights_notes: string;
}

export interface TokenSupply {
	total_supply_voi: string;
	circulating_supply_voi: string;
	unlocked_tokens_voi: string;
	locked_tokens_voi: string;
}

export interface TokenDistribution {
	community_allocation_voi: string;
	market_liquidity_voi: string;
	ecosystem_incentives_voi: string;
	block_authority_allocation_voi: string;
	other_reserves_voi: string;
}

export interface MarketAvailability {
	tokens_on_cex_voi: string;
	tokens_on_dex_voi: string;
	total_liquidity_voi: string;
	fdv_usd: string;
	tdv_usd: string;
}

export interface CommunityPayment {
	recipient: string;
	amount_voi: string;
	purpose: string;
	date: string;
}

export interface TransparencySummary {
	supply_transparency: string;
	authority_spend_activity: string;
	community_funding_health: string;
	risks_or_concerns: string;
}

export interface TransparencyData {
	token_supply_summary: TokenSupply;
	token_distribution_breakdown: TokenDistribution;
	market_availability: MarketAvailability;
	community_ecosystem_payments: CommunityPayment[];
	limitations_disclaimers: string;
	summary: TransparencySummary;
}

export interface WeeklyReport {
	year: string;
	month: string;
	period: string;
	category: 'network' | 'grants' | 'transparency';
	data: NetworkData | GrantsData | TransparencyData;
	generated_at: string;
}

export interface ReportPeriod {
	label: string;
	year: string;
	month: string;
	period: string;
}
