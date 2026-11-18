<script setup lang="ts">
import PortfolioPage from "../features/portfolios/PortfolioPage.vue"
import MetalsOverview from "../features/portfolios/metals/MetalsOverview.vue"
import MetalsView from "../features/portfolios/metals/MetalsView.vue"
</script>

<template>
  <PortfolioPage kind="metals" title="Precious Metals" empty-noun="metals">
    <template #default="{ portfolio }"><MetalsView :portfolio="portfolio" /></template>
    <template #overview="{ details }"><MetalsOverview :details="details" /></template>
  </PortfolioPage>
</template>
