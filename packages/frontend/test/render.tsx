import type { ReactElement } from "react"
import { render, type RenderResult } from "@testing-library/react"
import userEvent, { type UserEvent } from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { ApiAuthBridge } from "../src/api"
import { FakeAuthProvider } from "../src/providers/FakeAuthProvider"

/** Renders a page/component with the same providers the app has (auth, query client, router). */
export function renderApp(
  ui: ReactElement,
  { route = "/" }: { route?: string } = {},
): RenderResult & { user: UserEvent; client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  })
  const user = userEvent.setup()
  const utils = render(
    <FakeAuthProvider>
      <ApiAuthBridge>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </QueryClientProvider>
      </ApiAuthBridge>
    </FakeAuthProvider>,
  )
  return { ...utils, user, client }
}

export * from "@testing-library/react"
export { userEvent }
