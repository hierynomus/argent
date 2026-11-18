<script setup lang="ts">
import PortfolioPage from "../features/portfolios/PortfolioPage.vue"
import StocksView from "../features/portfolios/stocks/StocksView.vue"
</script>

<template>
  <PortfolioPage kind="stocks" title="Stocks" empty-noun="stock" with-broker v-slot="{ portfolio }">
    <StocksView :portfolio="portfolio" />
  </PortfolioPage>
</template>
