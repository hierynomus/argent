<script setup lang="ts">
import type { Account } from "@argent/shared"
import AccountsByType from "../features/accounts/AccountsByType.vue"

// accounts imported before the type column existed have no type: treat them as checking
const matches = (a: Account) => a.type === "checking" || a.type == null
</script>

<template><AccountsByType title="Checking" noun="checking accounts" empty-hint="Import a CAMT.053 file to get started, or add an account by hand." account-type="checking" :matches="matches" /></template>
