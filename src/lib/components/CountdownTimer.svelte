<script lang="ts">
    import { onMount, onDestroy } from 'svelte';

    export let targetDate: string;
    export let title: string;
    export let subtitle: string;
    export let link: string;
    export let divClass: string = '';

    let countdown = { days: 0, hours: 0, minutes: 0, seconds: 0 };
    let countdownInterval: NodeJS.Timeout;

    function updateCountdown() {
        const now = new Date().getTime();
        const target = new Date(targetDate).getTime();
        const difference = target - now;

        if (difference > 0) {
            countdown.days = Math.floor(difference / (1000 * 60 * 60 * 24));
            countdown.hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            countdown.minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
            countdown.seconds = Math.floor((difference % (1000 * 60)) / 1000);
        } else {
            clearInterval(countdownInterval);
        }
    }

    onMount(() => {
        updateCountdown();
        countdownInterval = setInterval(updateCountdown, 1000);
    });

    onDestroy(() => {
        if (countdownInterval) clearInterval(countdownInterval);
    });
</script>

<div class="{divClass ? divClass : 'bg-white dark:bg-gray-700 rounded-lg shadow-lg mb-8 p-6 text-center relative animate-background'}">
    <div class="absolute left-0 top-1/2 transform -translate-y-1/2 text-6xl animate-bounce">🚨</div>
    <div class="absolute right-0 top-1/2 transform -translate-y-1/2 text-6xl animate-bounce">🚨</div>
    <h2 class="text-xl font-bold mb-4 text-red-600 dark:text-red-400">{title}</h2>
    <div class="grid grid-cols-4 gap-4">
        <div>
            <span class="text-3xl font-bold text-orange-500 dark:text-orange-300">{countdown.days}</span>
            <p class="text-sm">Days</p>
        </div>
        <div>
            <span class="text-3xl font-bold text-orange-500 dark:text-orange-300">{countdown.hours}</span>
            <p class="text-sm">Hours</p>
        </div>
        <div>
            <span class="text-3xl font-bold text-orange-500 dark:text-orange-300">{countdown.minutes}</span>
            <p class="text-sm">Minutes</p>
        </div>
        <div>
            <span class="text-3xl font-bold text-orange-500 dark:text-orange-300">{countdown.seconds}</span>
            <p class="text-sm">Seconds</p>
        </div>
    </div>
    <div class="text-sm mt-2">
        <div class="text-yellow-600 dark:text-yellow-400">{subtitle}</div>
        <a href={link} target="_blank" class="text-blue-500 hover:text-blue-600 text-lg">{link}</a>
    </div>
</div>

<style>
    @keyframes backgroundPulse {
        0%, 100% { background-color: rgba(255, 255, 255, 1); }
        50% { background-color: rgba(254, 202, 202, 1); }
    }

    .animate-background {
        animation: backgroundPulse 3s ease-in-out infinite;
    }

    :global(.dark) .animate-background {
        animation-name: backgroundPulseDark;
    }

    @keyframes backgroundPulseDark {
        0%, 100% { background-color: rgba(55, 65, 81, 1); }
        50% { background-color: rgba(127, 29, 29, 1); }
    }
</style>