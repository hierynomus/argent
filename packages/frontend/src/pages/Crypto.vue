<script setup lang="ts">
import PortfolioPage from "../features/portfolios/PortfolioPage.vue"
import CryptoView from "../features/portfolios/crypto/CryptoView.vue"
</script>

<template>
  <PortfolioPage kind="crypto" title="Crypto" empty-noun="crypto" v-slot="{ portfolio }">
    <CryptoView :portfolio="portfolio" />
  </PortfolioPage>
</template>
