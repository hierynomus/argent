import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers"

// Make the jest-dom matchers (toBeInTheDocument, toBeDisabled, ...) known to bun:test's `expect`.
declare module "bun:test" {
  interface Matchers<T> extends TestingLibraryMatchers<unknown, T> {}
  interface AsymmetricMatchers extends TestingLibraryMatchers<unknown, unknown> {}
}
