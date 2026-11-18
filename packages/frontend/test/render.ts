import { defineComponent, h, type Component } from "vue"
import { render, type RenderResult } from "@testing-library/vue"
import userEvent, { type UserEvent } from "@testing-library/user-event"
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query"
import { createMemoryHistory, createRouter, type RouteRecordRaw, type Router } from "vue-router"
import { authPlugin, createFakeAuth, type Auth } from "../src/auth"

export interface RenderOptions {
  /** props of the component under test */
  props?: Record<string, unknown>
  slots?: Record<string, unknown>
  /** initial URL (the router starts here) */
  route?: string
  /** extra routes, e.g. to be able to navigate to them and assert `router.currentRoute` */
  routes?: RouteRecordRaw[]
  /** the signed-in user; defaults to a fake dev user */
  auth?: Auth
  /** share a query client between several renders (to test cache behaviour) */
  client?: QueryClient
  /** use this router instead of a blank one (e.g. the app's real router) */
  router?: Router
}

/**
 * Renders a component with the same plugins the app has (query client, router, auth).
 * It is async because the router must finish its first navigation before components read the route.
 */
export async function renderApp(
  component: Component,
  { props, slots, route = "/", routes = [], auth = createFakeAuth(), client: sharedClient, router: givenRouter }: RenderOptions = {},
): Promise<RenderResult & { user: UserEvent; client: QueryClient; router: Router; auth: Auth }> {
  const client =
    sharedClient ??
    new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } } })
  const blank = { render: () => h("div") }
  const router =
    givenRouter ??
    createRouter({
      history: createMemoryHistory(),
      routes: [...routes, { path: "/:pathMatch(.*)*", component: blank }],
    })
  await router.push(route)
  await router.isReady()

  const user = userEvent.setup()
  const utils = render(component as never, {
    props: props as never,
    slots: slots as never,
    global: { plugins: [[VueQueryPlugin, { queryClient: client }], router, authPlugin(auth)] },
  })
  return { ...utils, user, client, router, auth }
}

/**
 * Renders a template string with the given components — the equivalent of writing JSX in a test:
 *
 *   await renderTemplate(`<Field label="Name"><Input /></Field>`, { components: { Field, Input } })
 *
 * `setup` can return state/handlers the template uses.
 */
export function renderTemplate(
  template: string,
  { components, setup, ...options }: RenderOptions & { components?: Record<string, Component>; setup?: () => Record<string, unknown> } = {},
) {
  return renderApp(defineComponent({ components, template, setup: setup ?? (() => ({})) }), options)
}

/**
 * Runs a composable inside an app context (query client, router, auth) and returns what it returned.
 * Refs stay refs: read them with `.value`.
 */
export async function runComposable<T>(fn: () => T, options: RenderOptions = {}): Promise<Awaited<ReturnType<typeof renderApp>> & { result: T }> {
  let result!: T
  const Host = defineComponent({
    setup() {
      result = fn()
      return () => h("div")
    },
  })
  const utils = await renderApp(Host, options)
  return { ...utils, result }
}

export { screen, waitFor, within, fireEvent } from "@testing-library/vue"
export { userEvent }
