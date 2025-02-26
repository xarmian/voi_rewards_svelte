<script lang="ts">
    import type { Account } from '$lib/types';
    import { toast } from '@zerodevx/svelte-toast';

    export let primaryAccountInfo: Account | null;
    export let childAccounts: Account[];

    let isEmailOptedIn = false;
    let notificationPreferences = {
        rewards: {
            email: true,
            push: false
        },
        proposals: {
            email: true,
            push: true
        },
        security: {
            email: true,
            push: true
        }
    };

    async function handleOptInOut(value: boolean) {
        const formData = new FormData();
        formData.append('optin', value.toString());

        const response = await fetch('?/optin', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            toast.push(data.error.message, { theme: { '--toastBackground': '#EF4444' } });
            return false;
        } else {
            isEmailOptedIn = value;
            toast.push('Notification preferences updated successfully', { theme: { '--toastBackground': '#10B981' } });
            return true;
        }
    }

    function updatePreference(category: keyof typeof notificationPreferences, type: 'email' | 'push') {
        notificationPreferences[category][type] = !notificationPreferences[category][type];
        // TODO: Implement API call to save preferences
        toast.push('Preference updated', { theme: { '--toastBackground': '#10B981' } });
    }
</script>

<div class="max-w-4xl mx-auto p-4 space-y-6">
    <!-- Header -->
    <div class="border-b border-gray-200 dark:border-gray-700 pb-4">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Notification Preferences</h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">Manage how and when you want to receive notifications about your Voi accounts and activities.</p>
    </div>

    <!-- Global Email Opt-in -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div class="flex items-center justify-between">
            <div>
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Email Notifications</h2>
                <p class="text-sm text-gray-600 dark:text-gray-400">Enable or disable all email notifications</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
                <input 
                    type="checkbox" 
                    class="sr-only peer"
                    bind:checked={isEmailOptedIn}
                    on:change={() => handleOptInOut(!isEmailOptedIn)}
                >
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
            </label>
        </div>
    </div>

    <!-- Notification Categories -->
    <div class="space-y-4">
        <!-- Rewards Notifications -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Rewards Notifications</h3>
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white">Daily Rewards Summary</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Receive a daily summary of your earned rewards</p>
                    </div>
                    <div class="flex items-center gap-4">
                        <button
                            class={`px-3 py-1 rounded-full text-sm ${notificationPreferences.rewards.email ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
                            on:click={() => updatePreference('rewards', 'email')}
                        >
                            Email
                        </button>
                        <button
                            class={`px-3 py-1 rounded-full text-sm ${notificationPreferences.rewards.push ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
                            on:click={() => updatePreference('rewards', 'push')}
                        >
                            Push
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Proposals Notifications -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Proposals Notifications</h3>
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white">New Proposals</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Get notified when new proposals are available</p>
                    </div>
                    <div class="flex items-center gap-4">
                        <button
                            class={`px-3 py-1 rounded-full text-sm ${notificationPreferences.proposals.email ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
                            on:click={() => updatePreference('proposals', 'email')}
                        >
                            Email
                        </button>
                        <button
                            class={`px-3 py-1 rounded-full text-sm ${notificationPreferences.proposals.push ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
                            on:click={() => updatePreference('proposals', 'push')}
                        >
                            Push
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Security Notifications -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Security Notifications</h3>
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white">Account Security</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Important security alerts and updates</p>
                    </div>
                    <div class="flex items-center gap-4">
                        <button
                            class={`px-3 py-1 rounded-full text-sm ${notificationPreferences.security.email ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
                            on:click={() => updatePreference('security', 'email')}
                        >
                            Email
                        </button>
                        <button
                            class={`px-3 py-1 rounded-full text-sm ${notificationPreferences.security.push ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
                            on:click={() => updatePreference('security', 'push')}
                        >
                            Push
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Connected Accounts -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Connected Accounts</h3>
        <div class="space-y-4">
            {#if primaryAccountInfo}
                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white">Primary Account</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{primaryAccountInfo.address}</p>
                    </div>
                    <span class="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full dark:bg-green-900 dark:text-green-300">
                        Primary
                    </span>
                </div>
            {/if}
            
            {#if childAccounts && childAccounts.length > 0}
                {#each childAccounts as account}
                    <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div>
                            <p class="text-sm font-medium text-gray-900 dark:text-white">Connected Account</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">{account.address}</p>
                        </div>
                        <span class="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full dark:bg-blue-900 dark:text-blue-300">
                            Connected
                        </span>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</div>