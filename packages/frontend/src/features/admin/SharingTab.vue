<script setup lang="ts">
import { useAdminSharing } from "../../api"
import { LoadingText } from "../../components/ui"
import SharingOverview from "./SharingOverview.vue"

/** Settings → Sharing (admins, server): everything that is shared with groups, in one overview. */
const { data: sharing, isLoading } = useAdminSharing()
</script>

<template>
  <LoadingText v-if="isLoading" />
  <SharingOverview v-else :sharing="sharing ?? { portfolios: [], mortgages: [], loans: [], properties: [], equity: [], pensions: [] }" />
</template>
