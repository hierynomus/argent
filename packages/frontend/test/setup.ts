// DOM environment for component tests (happy-dom) + Testing Library matchers.
// Must register BEFORE anything from @testing-library is imported.
import { afterEach, expect } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register({ url: "http://localhost/" })

const matchers = await import("@testing-library/jest-dom/matchers")
expect.extend(matchers as never)

const { cleanup } = await import("@testing-library/react")
afterEach(() => cleanup())

// window.__ENV__ is read by auth.ts; keep it defined so importing it never throws in tests.
;(globalThis as { __ENV__?: Record<string, string> }).__ENV__ = {}
