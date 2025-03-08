<script lang="ts">
  import { onMount } from 'svelte';
  
  // Update the last modified date when the policy is updated
  const lastUpdated = "2025-03-07";
</script>

<div class="max-w-4xl mx-auto px-4 py-8 prose dark:prose-invert">
  <h1 class="text-3xl font-bold mb-8">Privacy Policy</h1>
  
  <p class="text-sm text-gray-600 dark:text-gray-400 mb-8">Last Updated: {lastUpdated}</p>

  <section class="mb-8">
    <h2 class="text-2xl font-semibold mb-4">Introduction</h2>
    <p>
      Voi Rewards Auditor ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website voirewards.com (the "Site").
    </p>
  </section>

  <section class="mb-8">
    <h2 class="text-2xl font-semibold mb-4">Information We Collect</h2>
    <h3 class="text-xl font-semibold mb-2">Information You Provide</h3>
    <p>We may collect information that you voluntarily provide when using our Site, including:</p>
    <ul>
      <li>Wallet addresses</li>
      <li>Contact information if you reach out to us</li>
      <li>Any other information you choose to provide</li>
    </ul>

    <h3 class="text-xl font-semibold mb-2 mt-4">Automatically Collected Information</h3>
    <p>When you visit the Site, we automatically collect certain information, including:</p>
    <ul>
      <li>Device information (browser type, operating system)</li>
      <li>IP address</li>
      <li>Usage data and browsing patterns</li>
      <li>Cookies and similar tracking technologies</li>
    </ul>
  </section>

  <section class="mb-8">
    <h2 class="text-2xl font-semibold mb-4">How We Use Your Information</h2>
    <p>We use the collected information for various purposes, including:</p>
    <ul>
      <li>Providing and maintaining our Service</li>
      <li>Analyzing usage patterns and improving our Site</li>
      <li>Personalizing user experience</li>
      <li>Communicating with you about updates or inquiries</li>
      <li>Displaying relevant advertising through Google Ads</li>
      <li>Detecting and preventing fraud</li>
    </ul>
  </section>

  <section class="mb-8">
    <h2 class="text-2xl font-semibold mb-4">Google Ads and Analytics</h2>
    <p>
      We use Google Ads and Google Analytics to serve advertisements and analyze traffic. These services may use cookies and other tracking technologies to collect and track information about your browsing behavior. You can learn more about Google's privacy practices by visiting their 
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline">Privacy Policy</a>.
    </p>
  </section>

  <section class="mb-8">
    <h2 class="text-2xl font-semibold mb-4">Your Privacy Rights</h2>
    <p>You have certain rights regarding your personal information, including:</p>
    <ul>
      <li>The right to access your personal information</li>
      <li>The right to correct inaccurate information</li>
      <li>The right to request deletion of your information</li>
      <li>The right to opt-out of certain data collection and use</li>
    </ul>
  </section>

  <section class="mb-8">
    <h2 class="text-2xl font-semibold mb-4">Data Security</h2>
    <p>
      We implement appropriate technical and organizational security measures to protect your information. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
    </p>
  </section>

  <section class="mb-8">
    <h2 class="text-2xl font-semibold mb-4">Children's Privacy</h2>
    <p>
      Our Site is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.
    </p>
  </section>

  <section class="mb-8">
    <h2 class="text-2xl font-semibold mb-4">Changes to This Privacy Policy</h2>
    <p>
      We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date.
    </p>
  </section>

  <section class="mb-8">
    <h2 class="text-2xl font-semibold mb-4">Contact Us</h2>
    <p>
      If you have any questions about this Privacy Policy, please contact us at:
      <a href="mailto:xarmian@gmail.com" class="text-blue-600 dark:text-blue-400 hover:underline">xarmian@gmail.com</a>
    </p>
  </section>
</div>

<style>
  :global(.dark) .prose {
    color: theme('colors.gray.300');
  }
  
  :global(.dark) .prose h1,
  :global(.dark) .prose h2,
  :global(.dark) .prose h3 {
    color: theme('colors.white');
  }
</style> 