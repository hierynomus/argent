<script setup lang="ts">
import PortfolioPage from "../features/portfolios/PortfolioPage.vue"
import AssetsOverview from "../features/portfolios/AssetsOverview.vue"
import CryptoView from "../features/portfolios/crypto/CryptoView.vue"
</script>

<template>
  <PortfolioPage kind="crypto" title="Crypto" empty-noun="crypto" with-account>
    <template #default="{ portfolio }"><CryptoView :portfolio="portfolio" /></template>
    <template #overview="{ details }"><AssetsOverview kind="crypto" :details="details" /></template>
  </PortfolioPage>
</template>
