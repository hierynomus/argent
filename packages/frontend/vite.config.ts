/// <reference types="vitest/config" />
import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "happy-dom",
    // tests build small host components from template strings, which needs Vue's runtime compiler
    alias: { vue: "vue/dist/vue.esm-bundler.js" },
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // the token getter and the fake fetch are module-level state: isolate every test file
    isolate: true,
    restoreMocks: true,
  },
})
