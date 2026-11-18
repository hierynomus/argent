import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/vue"

// Testing Library only auto-cleans when the runner exposes globals; we import everything explicitly.
afterEach(() => cleanup())

// window.__ENV__ is read by auth/config.ts; keep it defined so importing it never throws in tests.
;(globalThis as { __ENV__?: Record<string, string> }).__ENV__ = {}
