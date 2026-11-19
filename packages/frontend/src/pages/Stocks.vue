<script setup lang="ts">
import PortfolioPage from "../features/portfolios/PortfolioPage.vue"
import AssetsOverview from "../features/portfolios/AssetsOverview.vue"
import StocksView from "../features/portfolios/stocks/StocksView.vue"
</script>

<template>
  <PortfolioPage kind="stocks" title="Stocks" empty-noun="stock" with-broker with-account>
    <template #default="{ portfolio }"><StocksView :portfolio="portfolio" /></template>
    <template #overview="{ details }"><AssetsOverview kind="stocks" :details="details" /></template>
  </PortfolioPage>
</template>
