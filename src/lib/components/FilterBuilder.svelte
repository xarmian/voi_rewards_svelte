<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { Card, Button, Badge, Input, Select, Toggle } from 'flowbite-svelte';

	const dispatch = createEventDispatcher<{
		filterChange: FilterGroup;
		save: { name: string; filters: FilterGroup };
		load: string;
		preset: string;
		clear: void;
		export: { format: 'json' | 'url' };
	}>();

	export let open = false;

	interface FilterCondition {
		id: string;
		field: string;
		operator: string;
		value: string | number;
		active: boolean;
	}

	interface FilterGroup {
		id: string;
		conditions: FilterCondition[];
		operator: 'AND' | 'OR';
		active: boolean;
	}

	let filterGroups: FilterGroup[] = [createNewGroup()];
	let savedFilters: { name: string; filters: FilterGroup[] }[] = [];
	let filterName = '';
	let showSaveDialog = false;

	// Available filter fields and their configurations
	const filterFields = {
		volume24h: {
			label: '24h Volume',
			type: 'number',
			operators: ['>', '>=', '<', '<=', '=', '!='],
			placeholder: '100000',
			format: '$',
			icon: 'fas fa-chart-bar'
		},
		volume7d: {
			label: '7d Volume',
			type: 'number',
			operators: ['>', '>=', '<', '<=', '=', '!='],
			placeholder: '500000',
			format: '$',
			icon: 'fas fa-chart-line'
		},
		tvl: {
			label: 'Total Value Locked',
			type: 'number',
			operators: ['>', '>=', '<', '<=', '=', '!='],
			placeholder: '50000',
			format: '$',
			icon: 'fas fa-lock'
		},
		priceChange24h: {
			label: '24h Price Change',
			type: 'number',
			operators: ['>', '>=', '<', '<=', '=', '!='],
			placeholder: '5',
			format: '%',
			icon: 'fas fa-arrow-trend-up'
		},
		priceChange7d: {
			label: '7d Price Change',
			type: 'number',
			operators: ['>', '>=', '<', '<=', '=', '!='],
			placeholder: '10',
			format: '%',
			icon: 'fas fa-arrow-trend-up'
		},
		marketCap: {
			label: 'Market Cap',
			type: 'number',
			operators: ['>', '>=', '<', '<=', '=', '!='],
			placeholder: '1000000',
			format: '$',
			icon: 'fas fa-coins'
		},
		uniqueTraders24h: {
			label: 'Unique Traders (24h)',
			type: 'number',
			operators: ['>', '>=', '<', '<=', '=', '!='],
			placeholder: '100',
			format: '',
			icon: 'fas fa-users'
		},
		swapCount24h: {
			label: 'Swap Count (24h)',
			type: 'number',
			operators: ['>', '>=', '<', '<=', '=', '!='],
			placeholder: '50',
			format: '',
			icon: 'fas fa-exchange-alt'
		},
		poolCount: {
			label: 'Pool Count',
			type: 'number',
			operators: ['>', '>=', '<', '<=', '=', '!='],
			placeholder: '3',
			format: '',
			icon: 'fas fa-swimming-pool'
		},
		type: {
			label: 'Token Type',
			type: 'select',
			operators: ['=', '!=', 'in', 'not in'],
			options: ['VOI', 'ARC200', 'ASA'],
			icon: 'fas fa-tag'
		},
		symbol: {
			label: 'Symbol',
			type: 'text',
			operators: ['=', '!=', 'contains', 'starts with', 'ends with'],
			placeholder: 'USDC',
			icon: 'fas fa-font'
		},
		createdDate: {
			label: 'Created Date',
			type: 'date',
			operators: ['>', '>=', '<', '<=', '=', '!='],
			placeholder: '2024-01-01',
			icon: 'fas fa-calendar'
		}
	};

	// Preset filters
	const presetFilters = {
		'high-volume': {
			name: 'High Volume Tokens',
			description: 'Tokens with 24h volume > $100K',
			groups: [
				{
					id: generateId(),
					operator: 'AND' as const,
					active: true,
					conditions: [
						{
							id: generateId(),
							field: 'volume24h',
							operator: '>',
							value: 100000,
							active: true
						}
					]
				}
			]
		},
		'defi-giants': {
			name: 'DeFi Giants',
			description: 'High TVL tokens with multiple pools',
			groups: [
				{
					id: generateId(),
					operator: 'AND' as const,
					active: true,
					conditions: [
						{
							id: generateId(),
							field: 'tvl',
							operator: '>',
							value: 1000000,
							active: true
						},
						{
							id: generateId(),
							field: 'poolCount',
							operator: '>=',
							value: 5,
							active: true
						}
					]
				}
			]
		},
		trending: {
			name: 'Trending Tokens',
			description: 'High activity and positive price movement',
			groups: [
				{
					id: generateId(),
					operator: 'AND' as const,
					active: true,
					conditions: [
						{
							id: generateId(),
							field: 'priceChange24h',
							operator: '>',
							value: 5,
							active: true
						},
						{
							id: generateId(),
							field: 'uniqueTraders24h',
							operator: '>',
							value: 100,
							active: true
						}
					]
				}
			]
		},
		'micro-caps': {
			name: 'Micro Caps',
			description: 'Small market cap tokens with potential',
			groups: [
				{
					id: generateId(),
					operator: 'AND' as const,
					active: true,
					conditions: [
						{
							id: generateId(),
							field: 'marketCap',
							operator: '<',
							value: 100000,
							active: true
						},
						{
							id: generateId(),
							field: 'volume24h',
							operator: '>',
							value: 10000,
							active: true
						}
					]
				}
			]
		}
	};

	function generateId(): string {
		return Math.random().toString(36).substr(2, 9);
	}

	function createNewGroup(): FilterGroup {
		return {
			id: generateId(),
			conditions: [createNewCondition()],
			operator: 'AND',
			active: true
		};
	}

	function createNewCondition(): FilterCondition {
		return {
			id: generateId(),
			field: 'volume24h',
			operator: '>',
			value: '',
			active: true
		};
	}

	function addGroup() {
		filterGroups = [...filterGroups, createNewGroup()];
		emitFilterChange();
	}

	function removeGroup(groupId: string) {
		filterGroups = filterGroups.filter((g) => g.id !== groupId);
		if (filterGroups.length === 0) {
			filterGroups = [createNewGroup()];
		}
		emitFilterChange();
	}

	function addCondition(groupId: string) {
		filterGroups = filterGroups.map((group) =>
			group.id === groupId
				? { ...group, conditions: [...group.conditions, createNewCondition()] }
				: group
		);
		emitFilterChange();
	}

	function removeCondition(groupId: string, conditionId: string) {
		filterGroups = filterGroups.map((group) => {
			if (group.id === groupId) {
				const newConditions = group.conditions.filter((c) => c.id !== conditionId);
				return {
					...group,
					conditions: newConditions.length > 0 ? newConditions : [createNewCondition()]
				};
			}
			return group;
		});
		emitFilterChange();
	}

	function updateCondition(
		groupId: string,
		conditionId: string,
		updates: Partial<FilterCondition>
	) {
		filterGroups = filterGroups.map((group) =>
			group.id === groupId
				? {
						...group,
						conditions: group.conditions.map((condition) =>
							condition.id === conditionId ? { ...condition, ...updates } : condition
						)
					}
				: group
		);
		emitFilterChange();
	}

	function updateGroup(groupId: string, updates: Partial<FilterGroup>) {
		filterGroups = filterGroups.map((group) =>
			group.id === groupId ? { ...group, ...updates } : group
		);
		emitFilterChange();
	}

	function emitFilterChange() {
		// For now, just emit the first group - extend later for multiple groups
		if (filterGroups.length > 0) {
			dispatch('filterChange', filterGroups[0]);
		}
	}

	function applyPreset(presetKey: string) {
		const preset = presetFilters[presetKey as keyof typeof presetFilters];
		if (preset) {
			filterGroups = [...preset.groups];
			emitFilterChange();
			dispatch('preset', presetKey);
		}
	}

	function clearAllFilters() {
		filterGroups = [createNewGroup()];
		emitFilterChange();
		dispatch('clear');
	}

	function saveFilter() {
		if (!filterName.trim()) return;

		const savedFilter = {
			name: filterName.trim(),
			filters: filterGroups[0] // For now, save just the first group
		};

		savedFilters = [...savedFilters, savedFilter];
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('tokenFiltersSaved', JSON.stringify(savedFilters));
		}

		dispatch('save', savedFilter);
		filterName = '';
		showSaveDialog = false;
	}

	function loadSavedFilter(filterName: string) {
		const filter = savedFilters.find((f) => f.name === filterName);
		if (filter) {
			filterGroups = [filter.filters];
			emitFilterChange();
			dispatch('load', filterName);
		}
	}

	function deleteSavedFilter(filterName: string) {
		savedFilters = savedFilters.filter((f) => f.name !== filterName);
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('tokenFiltersSaved', JSON.stringify(savedFilters));
		}
	}

	function exportFilters(format: 'json' | 'url') {
		dispatch('export', { format });
	}

	function getConditionSummary(condition: FilterCondition): string {
		const field = filterFields[condition.field as keyof typeof filterFields];
		const value = field?.format ? `${field.format}${condition.value}` : condition.value.toString();

		return `${field?.label || condition.field} ${condition.operator} ${value}`;
	}

	function getActiveConditionsCount(): number {
		return filterGroups.reduce(
			(total, group) => total + group.conditions.filter((c) => c.active && c.value !== '').length,
			0
		);
	}

	// Load saved filters on mount
	if (typeof localStorage !== 'undefined') {
		try {
			const saved = localStorage.getItem('tokenFiltersSaved');
			if (saved) {
				savedFilters = JSON.parse(saved);
			}
		} catch (e) {
			console.warn('Failed to load saved filters:', e);
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
		transition:fade
	>
		<Card class="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
			<!-- Header -->
			<div
				class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600"
			>
				<div>
					<h2 class="text-xl font-bold text-gray-900 dark:text-white">Advanced Filter Builder</h2>
					<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
						{getActiveConditionsCount()} active filter{getActiveConditionsCount() !== 1 ? 's' : ''}
					</p>
				</div>

				<div class="flex items-center gap-2">
					<Button size="sm" color="alternative" on:click={() => (showSaveDialog = true)}>
						<i class="fas fa-save mr-2"></i>
						Save
					</Button>
					<Button size="sm" color="alternative" on:click={() => exportFilters('json')}>
						<i class="fas fa-download mr-2"></i>
						Export
					</Button>
					<Button size="sm" color="light" on:click={() => (open = false)}>
						<i class="fas fa-times"></i>
					</Button>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto">
				<!-- Preset filters -->
				<div class="p-6 border-b border-gray-200 dark:border-gray-600">
					<h3 class="font-semibold text-gray-900 dark:text-white mb-3">Quick Presets</h3>
					<div class="flex flex-wrap gap-2">
						{#each Object.entries(presetFilters) as [key, preset]}
							<Button
								size="sm"
								color="alternative"
								class="text-xs"
								on:click={() => applyPreset(key)}
								title={preset.description}
							>
								{preset.name}
							</Button>
						{/each}
						<Button size="sm" color="red" outline class="text-xs" on:click={clearAllFilters}>
							<i class="fas fa-trash-alt mr-1"></i>
							Clear All
						</Button>
					</div>
				</div>

				<!-- Filter groups -->
				<div class="p-6 space-y-6">
					{#each filterGroups as group, groupIndex (group.id)}
						<Card class="border border-gray-200 dark:border-gray-600">
							<!-- Group header -->
							<div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800">
								<div class="flex items-center gap-3">
									<Toggle
										bind:checked={group.active}
										on:change={() => updateGroup(group.id, { active: group.active })}
									/>

									<span class="font-medium text-gray-900 dark:text-white">
										Filter Group {groupIndex + 1}
									</span>

									{#if group.conditions.length > 1}
										<Select
											bind:value={group.operator}
											on:change={() => updateGroup(group.id, { operator: group.operator })}
											size="sm"
											class="w-20"
										>
											<option value="AND">AND</option>
											<option value="OR">OR</option>
										</Select>
									{/if}

									<Badge class="text-xs">
										{group.conditions.filter((c) => c.active && c.value !== '').length} conditions
									</Badge>
								</div>

								<div class="flex items-center gap-2">
									<Button size="xs" color="alternative" on:click={() => addCondition(group.id)}>
										<i class="fas fa-plus mr-1"></i>
										Add Condition
									</Button>

									{#if filterGroups.length > 1}
										<Button size="xs" color="red" outline on:click={() => removeGroup(group.id)}>
											<i class="fas fa-trash-alt"></i>
										</Button>
									{/if}
								</div>
							</div>

							<!-- Conditions -->
							<div class="p-4 space-y-3">
								{#each group.conditions as condition, conditionIndex (condition.id)}
									<div
										class="flex items-center gap-3 p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
										animate:flip={{ duration: 200 }}
										transition:slide|local={{ duration: 200 }}
									>
										<!-- Active toggle -->
										<Toggle
											bind:checked={condition.active}
											on:change={() =>
												updateCondition(group.id, condition.id, { active: condition.active })}
											size="sm"
										/>

										<!-- Condition indicator -->
										{#if conditionIndex > 0}
											<span
												class="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-1 bg-gray-100 dark:bg-gray-600 rounded"
											>
												{group.operator}
											</span>
										{/if}

										<!-- Field selector -->
										<div class="flex-1">
											<Select
												bind:value={condition.field}
												on:change={() =>
													updateCondition(group.id, condition.id, {
														field: condition.field,
														operator:
															filterFields[condition.field as keyof typeof filterFields]
																?.operators[0] || '=',
														value: ''
													})}
												size="sm"
											>
												{#each Object.entries(filterFields) as [key, field]}
													<option value={key}>
														{field.label}
													</option>
												{/each}
											</Select>
										</div>

										<!-- Operator selector -->
										<div class="w-20">
											<Select
												bind:value={condition.operator}
												on:change={() =>
													updateCondition(group.id, condition.id, { operator: condition.operator })}
												size="sm"
											>
												{#each filterFields[condition.field as keyof typeof filterFields]?.operators || ['='] as operator}
													<option value={operator}>{operator}</option>
												{/each}
											</Select>
										</div>

										<!-- Value input -->
										<div class="flex-1">
											{#if filterFields[condition.field as keyof typeof filterFields]?.type === 'select'}
												{@const field = filterFields[condition.field as keyof typeof filterFields]}
												<Select
													bind:value={condition.value}
													on:change={() =>
														updateCondition(group.id, condition.id, { value: condition.value })}
													size="sm"
												>
													{#each field.options || [] as option}
														<option value={option}>{option}</option>
													{/each}
												</Select>
											{:else if filterFields[condition.field as keyof typeof filterFields]?.type === 'number'}
												{@const field = filterFields[condition.field as keyof typeof filterFields]}
												<Input
													type="number"
													bind:value={condition.value}
													on:input={() =>
														updateCondition(group.id, condition.id, { value: condition.value })}
													placeholder={field?.placeholder}
													size="sm"
												/>
											{:else}
												{@const field = filterFields[condition.field as keyof typeof filterFields]}
												<Input
													type={field?.type || 'text'}
													bind:value={condition.value}
													on:input={() =>
														updateCondition(group.id, condition.id, { value: condition.value })}
													placeholder={field?.placeholder || 'Enter value...'}
													size="sm"
												/>
											{/if}
										</div>

										<!-- Remove condition -->
										{#if group.conditions.length > 1}
											<Button
												size="xs"
												color="red"
												outline
												on:click={() => removeCondition(group.id, condition.id)}
											>
												<i class="fas fa-times"></i>
											</Button>
										{/if}
									</div>
								{/each}
							</div>
						</Card>
					{/each}

					<!-- Add group button -->
					<div class="text-center">
						<Button color="alternative" on:click={addGroup}>
							<i class="fas fa-plus mr-2"></i>
							Add Filter Group
						</Button>
					</div>
				</div>

				<!-- Saved filters -->
				{#if savedFilters.length > 0}
					<div class="p-6 border-t border-gray-200 dark:border-gray-600">
						<h3 class="font-semibold text-gray-900 dark:text-white mb-3">Saved Filters</h3>
						<div class="space-y-2">
							{#each savedFilters as savedFilter}
								<div
									class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
								>
									<div>
										<span class="font-medium text-gray-900 dark:text-white">
											{savedFilter.name}
										</span>
										<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
											{savedFilter.filters.conditions?.filter((c) => c.active).length || 0} conditions
										</p>
									</div>
									<div class="flex gap-2">
										<Button
											size="xs"
											color="alternative"
											on:click={() => loadSavedFilter(savedFilter.name)}
										>
											Load
										</Button>
										<Button
											size="xs"
											color="red"
											outline
											on:click={() => deleteSavedFilter(savedFilter.name)}
										>
											<i class="fas fa-trash-alt"></i>
										</Button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Filter summary -->
				<div
					class="p-6 bg-blue-50 dark:bg-blue-900/20 border-t border-gray-200 dark:border-gray-600"
				>
					<h4 class="font-semibold text-blue-900 dark:text-blue-100 mb-2">
						<i class="fas fa-filter mr-2"></i>
						Active Filters Summary
					</h4>
					<div class="space-y-1 text-sm">
						{#each filterGroups.filter((g) => g.active) as group, groupIndex}
							{#each group.conditions.filter((c) => c.active && c.value !== '') as condition}
								<div class="text-blue-800 dark:text-blue-200">
									{groupIndex > 0 ? 'OR' : ''}
									{getConditionSummary(condition)}
								</div>
							{/each}
						{/each}

						{#if getActiveConditionsCount() === 0}
							<div class="text-gray-500 dark:text-gray-400 italic">No active filters</div>
						{/if}
					</div>
				</div>
			</div>
		</Card>

		<!-- Save dialog -->
		{#if showSaveDialog}
			<div class="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50">
				<Card class="w-full max-w-md">
					<div class="p-6">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Save Filter</h3>
						<Input
							bind:value={filterName}
							placeholder="Enter filter name..."
							class="mb-4"
							on:keydown={(e) => e.key === 'Enter' && saveFilter()}
						/>
						<div class="flex justify-end gap-2">
							<Button color="alternative" on:click={() => (showSaveDialog = false)}>Cancel</Button>
							<Button color="purple" on:click={saveFilter} disabled={!filterName.trim()}>
								Save Filter
							</Button>
						</div>
					</div>
				</Card>
			</div>
		{/if}
	</div>
{/if}
