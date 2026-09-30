# Standard: frontend

Uniform rules for a web application client in React + TypeScript + Tailwind: component library,
tokens, server data, state, forms, accessibility, performance, tests and in-browser verification.

Builds on: ../project-structure-design.md (§ 1 structure, § 2 structure rules, § 3.1 design deliverables, § 15 guards S1, S2, S10, S19); standard-api-design.md (§ 5 errors, § 7 pagination)

## 1 · Core principle

- **The server decides, the client displays.** The client does not compute prices, states or permissions, it only
  shows them. Anything that affects stored data is verified on the server.
- **The page composes, the library draws.** Bare `<button>`, `<input>`, `<select>`, `<textarea>`
  exist only in `client/src/components/ui/` (S1). The page does not handle appearance, focus or states.
- **The page does not know URLs.** The server is called only from `modules/<area>/api.ts` (S2).
- **Every view of data has four states:** loading, empty, error, data. A missing state
  is a bug, not a detail.
- **Done means seen in the browser** at every width from the task brief, against the running version (§ 14).
- **Structure per § 1** (including `modules/<area>/<area>Texts.ts` for UI texts, § 12).


## 2 · Component library

The library is built before the first screen, according to `docs/design/component-specs.md`. A component
is missing? It is added to the library first, then used. There are no exceptions inside a page.

- **Props by intent, not by appearance.** `variant="danger"`, not `color="red"`. Variants
  and sizes are closed union types (`"primary" | "secondary" | "ghost"`).
- **All states from the specification:** default, hover, active, focus, disabled, error, and for actions
  `loading`. State is set by a prop, not by a class from outside.
- **Accessibility is built in:** correct element, `type="button"` as default, visible
  focus, `aria-*` handled by the component. The page has no way to break it.
- **Native attributes pass through** (`...rest`), the ref is forwarded (`forwardRef`; in React 19
  `ref` as a prop is enough). Without a ref you cannot set focus or measure the element.
- **`className` from outside only for layout** (width, margin, grid position), never color,
  font or state. A color from outside is a sign of a missing variant.
- **Composition over configuration.** `Dialog` with `Dialog.Title`, `Dialog.Body`, `Dialog.Actions`
  instead of twenty props. A component with more than ~10 props gets split.
- **Controlled and uncontrolled forms only where it makes sense.** Form fields are controlled
  (`value` + `onChange`); a dialog and a collapsible panel support both (`open` + `onOpenChange`,
  optionally `defaultOpen`). A component never switches between controlled and uncontrolled at runtime.
- **A field carries its own label, hint and error.** `TextField label="E-mail" error={...}` wires up
  `id`, `aria-describedby` and `aria-invalid`. A field without a label cannot be created (the type enforces it).

```tsx
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, type = "button", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(baseClass, variantClass[variant], sizeClass[size], className)}
      {...rest}
    >
      {loading && <Spinner aria-hidden />}
      {children}
    </button>
  );
});
```

- **Minimum before the first screen:** Button, IconButton, TextField, NumberField, Select,
  Checkbox, TextArea, Dialog, Table, Skeleton, EmptyState, ErrorState, Toast, PageLayout.
- **An off-the-shelf library** (headless primitives, shadcn/ui) is wrapped in its own API in `components/ui/`.

## 3 · Design tokens

- **The single source is `docs/design/design-tokens.json`** (§ 3.1). CSS variables are generated from it
  and Tailwind only maps them. A hand-written color in a component does not exist.
- **No `#hex` and no arbitrary value (`w-[37px]`) in TSX** (S19). If a value is missing, a token
  is added, not an exception.
- **Semantic names above the palette:** `surface`, `text`, `text-muted`, `border`, `danger`.
  Components use semantics; the palette (`primary-600`) sits beneath them.
- **Dark mode switches variables, not classes in components.** Dark variants are designed
  together with the light ones and contrast is measured separately.
- **Spacing, radii, shadows, animations and z-index are scales**, not free numbers.

```css
/* client/src/styles/tokens.css, generated from design-tokens.json */
:root { --color-surface: #ffffff; --color-text: #111827; --color-danger: #b91c1c; }
[data-theme="dark"] { --color-surface: #0f172a; --color-text: #f1f5f9; --color-danger: #f87171; }
```

```ts
// tailwind.config.ts (excerpt; Tailwind requires a default export)
import type { Config } from "tailwindcss";

export default {
  theme: {
    extend: {
      colors: {
        surface: "var(--color-surface)",
        text: "var(--color-text)",
        danger: "var(--color-danger)",
      },
    },
  },
} satisfies Config;
```

## 4 · Composing pages

- **Page = layout + data + components.** No styles except layout, no logic
  except calling hooks from `api.ts` and functions from `<area>Model.ts`.
- **One application shell** (`PageLayout` with a "skip to content" link). A page does not invent
  its own arrangement; when the convention is silent, the choice is written into the PR.
- **Shaping data for display belongs in `<area>Model.ts`** as pure functions: sorting,
  grouping, state label, total for display. Business rules do not (§ 15).
- **The client only displays permissions** based on the server response; a hidden button is not a check.
- **Files up to 300 lines, functions up to 50** (S10); a large page is split into sections, not into "utils".

## 5 · Server data

- **One `api.ts` per area.** Functions return data that passed a schema from `packages/contracts`
  (`schema.parse`). If the shape does not match, the error happens here, not three components later.
- **Server state is held by a query library** (e.g. TanStack Query), never `useEffect` +
  `fetch` + `useState`. Cache, retries, invalidation after writes and concurrency are handled in one place.
- **`lib/http.ts` converts `application/problem+json` into a typed error** and parses nothing
  else. It never returns an empty result instead of an error.
- **An error has two forms:** the user sees a clear sentence based on `type` (for `400`, errors on
  fields), the log gets the original problem with `trace_id`. No stack trace and no raw `detail`.
- **`retryable` and `Retry-After` decide about retries;** only one layer retries.
  A non-retryable error offers a concrete step, not a "try again" button.
- **Lists paginate by cursor** (`next_cursor`, `has_more`). The client does not build the cursor, it only
  sends it back. "Load more" or infinite scroll, never downloading everything.
- **Writes carry an `Idempotency-Key`** and the button is in `loading` while submitting.

```ts
// client/src/lib/http.ts (excerpt)
export class ApiError extends Error {
  constructor(readonly status: number, readonly problem: Problem) {
    super(problem.title);
  }
}

export function userMessage(error: ApiError): string {
  return problemMessages[error.problem.type] ?? commonTexts.unexpectedError;
}
```

```tsx
function OrderList() {
  const query = useOrders();
  if (query.isPending) return <Skeleton rows={5} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data.data.length === 0) return <EmptyState action={<CreateOrderButton />} />;
  return <OrderTable rows={toOrderRows(query.data.data)} />;
}
```

- **Empty is not an error:** a failure that looks like an empty list misleads the user.
- **Loading longer than ~300 ms shows a skeleton** in the shape of the result, not a spinner over
  the whole page. The skeleton holds the space, so CLS does not grow.

## 6 · Client state

- **Local component state first.** It is lifted to a common parent only when two places really
  share it. A global store only for truly global things (signed-in user,
  theme, language).
- **Server data is not copied into local state.** The copy goes stale; read from the query cache.
- **Filters, sorting, page and selected tab live in the URL** (`useSearchParams`). The link can be
  shared, the back button works, a page refresh loses nothing.
- **Derived values are computed, not stored** (a second `useState` is a second source of truth).
- **Permissions loaded at SPA start go stale;** they are refreshed after a role change.

## 7 · Forms and validation

- **Data shape is validated by the shared schema** from `packages/contracts` (e.g. Zod) already in the form.
  The user gets the error immediately, but the server remains the authority and validates everything again.
- **Server errors (`400`, all fields at once) are mapped to fields.** After a failed
  submit, focus goes to the first invalid field; the error summary is in `role="alert"`.
- **Business rules (limit, state, permission) are not in the form.** The client learns them from
  the server response.
- **A numeric field holds the draft text, not a number.** Conversion happens only on submit. It accepts a decimal comma
  according to the user's language.
- **The button says what will happen** ("Save changes"), is in `loading` while submitting, and a double
  click does not create two records (idempotency, § 5).

```tsx
// BAD: zero disappears, "0.08" cannot be typed (the intermediate "0." is converted back)
<NumberField value={price || ""} onChange={(text) => setPrice(Number(text))} />

// GOOD: the text is kept, the number is created only on submit
const [priceDraft, setPriceDraft] = useState(String(initialPrice));
<NumberField value={priceDraft} onChange={setPriceDraft} />
const price = parseDecimal(priceDraft); // lib/, returns number | null
```

- **Why:** a controlled input with `x || ""` drops `0`, and converting to a number on every keystroke breaks
  values being typed. A test catches this only by typing character by character and checking the stored value.

## 8 · Routing and code splitting

- **Every page is lazy-loaded** at the route level. The initial bundle contains only the shell and the first
  screen.
- **Named exports stay**; `lazy` is wired up via `then`.
- **After a route change, focus goes to the main heading or `<main>`**, and the window title changes.
- **A chunk load error after deployment** (old client, new server) offers a page reload,
  not a white screen. The API changes its contract additively, because an open browser holds
  the old client.
- **Every route has an error boundary** with `ErrorState` and logging.

```tsx
const OrdersPage = lazy(() =>
  import("./modules/orders/pages/OrdersPage").then((module) => ({ default: module.OrdersPage })),
);
```

## 9 · Accessibility in practice (WCAG 2.1 AA)

- **Keyboard:** every action works from the keyboard; a dialog traps focus, Escape closes it and focus
  returns to the triggering element.
- **Visible focus** (`focus-visible`) on every interactive element.
- **Labels:** a field has a `<label>`, an icon button `aria-label`, an image `alt` (decoration `""`).
- **Contrast** of text 4.5:1, of large text and controls 3:1; color is not the only carrier
  of meaning.
- **Announcements** of errors and toasts via `aria-live`; a toast does not take focus.
- **Reduced motion:** every animation respects `prefers-reduced-motion`. Animate
  `transform` and `opacity`, not dimensions.
- **Reveal fallback:** with `reduce`, an animation library may leave an element at
  `opacity: 0`. Every reveal has a CSS fallback in the same place that shows the element.
- **Touch targets at least 44 × 44 px;** nothing depends on hover alone.
- **Automated checks** (e.g. axe) catch only some errors; keyboard and screen reader are verified by a human.

## 10 · Performance

- **Core Web Vitals targets (75th percentile):** LCP < 2.5 s, INP < 200 ms, CLS < 0.1.
- **Measure first, then optimize.** Every number has a baseline and a target, measured in
  conditions close to production (production build, throttled network and CPU).
- **The bundle budget is guarded by CI.** The project sets a cap on initial JS (gzip) and the build
  checks it; a new dependency is judged by its size.
- **Images:** WebP or AVIF, `srcset` and `sizes`, `width` and `height` (or `aspect-ratio`),
  `loading="lazy"` below the fold, while the hero image is loaded with priority.
- **Fonts** `font-display: swap`; **lists** above ~50 complex rows are virtualized.
- **`useMemo` and `memo` only after profiling;** an expensive computation belongs in `Model.ts` with a test.

## 11 · Responsiveness and mobile QA

- **Mobile-first:** base styles for narrow widths, wider ones via breakpoints from the token scale.
  Body text at least 16 px (otherwise iOS zooms in on field focus).
- **No horizontal overflow** (one wide element shrinks or clips the page). Defense:
  `min-width: 0` on flex and grid items, `flex-wrap` on rows of tags, `overflow-wrap:
  anywhere` on URLs and file names, `minmax(0, 1fr)` instead of a bare `1fr`.
- **`IntersectionObserver` for reveals uses `threshold: 0`.** Why: an element taller than
  the screen never reaches a percentage threshold and stays invisible, and only on phones.
- **Measure, don't eyeball:** at 390 px compare `document.body.scrollWidth` with the width and find the culprit
  via `getBoundingClientRect().right`. A browser window has a minimum width; a narrow
  width comes from device emulation or an `<iframe>`; programmatic scroll may not trigger the observer.

## 12 · UI texts and language

- **UI in the user's language, code in English.** Identifiers, comments and text keys are
  in English; a domain exception is recorded in the README as a rule.
- **Texts are not scattered in JSX:** they live in `<area>Texts.ts`, with multiple languages in an i18n catalog.
- **Numbers, currencies and dates via `Intl`** in `lib/` with the user's language, never manual formatting.
- **An action has the same name through the whole flow:** button "Publish", notification "Published".
- **An error says what happened and what to do,** without apologies and without technical codes. An empty state
  offers the first step.

## 13 · Tests

| Layer | What it tests | Tool (example) |
|---|---|---|
| Unit | `<area>Model.ts`, `lib/` (formatting, number conversion) | Vitest |
| Component | UI library and page sections: states, keyboard, field errors | Testing Library |
| E2E | a few main flows in the browser against a running server | Playwright |

- **Logic in `Model.ts` always has a test;** a component that contains logic is a structure bug.
- **Query by role and label** (`getByRole("button", { name: "Save" })`), not by classes
  or `data-testid`. The test thereby also guards accessibility.
- **Write like a user** (`userEvent.type`) and verify the submitted or stored value.
- **Control run:** revert the fix and verify the test turns red, otherwise it does not measure the change.
- **Every data state** (loading, empty, error, data) has a test for the main views.
- **Verify both animation and fallback** with both reduced-motion settings; a headless browser
  may have a different default than the user.

## 14 · In-browser verification

- **After deployment, hard reload first;** an open tab holds the old bundle. The UI shows the version.
- **Navigation reads the cache, `fetch` does not.** Both the client router and the HTTP cache can return a stale
  response even after a fix. A query from the console decides:

```ts
const response = await fetch(url, { cache: "no-store" });
```

- **Verify by outcome, not by action.** "The click happened" proves nothing; what decides is the state on
  screen after a reload or the value on the server.
- **A hidden element in the DOM is not a visible element.** An automated click can hit a collapsed or
  hidden control; read state from `aria-expanded`, `aria-checked` and the like.
- **A screenshot at every width from the task brief** is inspected, not just taken; the paths go into the PR.

## 15 · What belongs in the client and what on the server

| Belongs in the client | Belongs on the server |
|---|---|
| number, date, currency formatting for display | computing prices, VAT, totals that get stored |
| sorting and grouping an already loaded page | filtering and sorting across all data |
| immediate field shape check (schema) | validity against state (limit, uniqueness, state transition) |
| hiding or locking an action based on permissions | permission check on every request |
| state label and color | state transition and who may perform it |
| draft form in progress | stored record, audit, idempotency |
| filter, tab, page in the URL | pagination cursor and limit with a maximum |
| clear error sentence | RFC 9457 error shape, `retryable`, `trace_id` |

Rule for disputed cases: if a wrong result on the client would change stored data or
another user's decision, it belongs on the server.

## Checklist

- [ ] the page does not use bare `<button>`, `<input>`, `<select>`, `<textarea>` (S1)
- [ ] a new component is in the library, has all states from the specification, forwards ref and attributes
- [ ] no `#hex` and no arbitrary value in TSX, only tokens (S19)
- [ ] server calls only in `api.ts`, the response passed a schema from contracts (S2)
- [ ] every view of data has loading, empty, error and data states
- [ ] API error: a clear sentence for the user, the original problem with `trace_id` in the log
- [ ] the list paginates by cursor; writes have an `Idempotency-Key`; filters and sorting are in the URL
- [ ] form: schema from contracts, server errors on fields, focus on the first invalid field
- [ ] the numeric field holds text, `0` and a decimal number can be typed and saved
- [ ] the page is lazy-loaded, after a route change focus goes to the content
- [ ] keyboard, visible focus, labels, contrast 4.5:1, `aria-live` for errors
- [ ] animations respect reduced motion and have a CSS visibility fallback
- [ ] the bundle budget in CI passed; LCP, INP and CLS on target; images have dimensions
- [ ] at 390 px there is no horizontal overflow (measured with `scrollWidth`)
- [ ] UI texts in the area's texts file, numbers and dates via `Intl`
- [ ] logic in `Model.ts` has a test; the control run with the fix reverted turned red
- [ ] verified in the browser after a hard reload, screenshots at all widths inspected

## Anti-patterns

- **`useEffect` + `fetch` in a page:** races, no cache, the error gets lost.
- **Raw `detail` or stack trace in the UI:** leaks internals and does not help the user.
- **Color or `!important` pushed into a component from outside:** appearance drifts; a variant is missing.
- **A business rule in a component or in `Model.ts`:** a second source of truth next to the server.
- **Server data copied into `useState`:** after a write elsewhere it shows stale state.
- **Filters only in memory:** a page refresh wipes them, the link cannot be shared.
- **`outline: none` without replacement, an icon without a label:** keyboard and screen reader users stand no chance.
- **A reveal without a reduced-motion fallback, a percentage observer threshold:** content stays
  invisible, typically only on phones.
- **"Fixed" based on navigation in an open tab:** the cache or old bundle shows the old state;
  verify with `fetch` using `no-store` and the version.
