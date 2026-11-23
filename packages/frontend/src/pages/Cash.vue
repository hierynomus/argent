<script setup lang="ts">
import type { Account } from "@argent/shared"
import AccountsByType from "../features/accounts/AccountsByType.vue"

const matches = (a: Account) => a.type === "cash"
</script>

<template>
  <AccountsByType title="Cash" noun="cash accounts" empty-hint="Add the cash you keep at home, then enter what you take out and what you pay with it." account-type="cash" :matches="matches" />
</template>
