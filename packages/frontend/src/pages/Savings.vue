<script setup lang="ts">
import type { Account } from "@argent/shared"
import AccountsByType from "../features/accounts/AccountsByType.vue"

const matches = (a: Account) => a.type === "savings"
</script>

<template><AccountsByType title="Savings" noun="savings accounts" empty-hint="Mark an account as Savings in Settings → Accounts, or add one by hand." account-type="savings" :matches="matches" /></template>
