<script setup lang="ts">
import PortfolioPage from "../features/portfolios/PortfolioPage.vue"
import MetalsView from "../features/portfolios/metals/MetalsView.vue"
</script>

<template>
  <PortfolioPage kind="metals" title="Precious Metals" empty-noun="metals" v-slot="{ portfolio }">
    <MetalsView :portfolio="portfolio" />
  </PortfolioPage>
</template>
