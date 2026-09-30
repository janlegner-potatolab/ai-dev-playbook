# Standard: domain and code design

How to name, bound and layer the domain (DDD), when to apply SOLID, and how to pass dependencies
(dependency injection) so that code stays readable, testable and free of unnecessary abstraction.

Builds on: ../project-structure-design.md (§ 0 principle 2, § 1 structure and layers, § 2 structure rules, § 3 steps 4 to 6 and 12, § 15 guards S3, S4, S9, S10, S14, S16)

## 1 · Main idea

- **The risk is not violation, but overuse.** Every developer and every model knows DDD, SOLID and DI.
  The damage comes from `AbstractFactoryStrategyBuilder` and an aggregate over a CRUD table, not from their absence.
- **The strategic part always applies, the tactical part only by decision.** Ubiquitous language and area boundaries
  are mandatory in every project. Entities, aggregates and domain events are introduced only where
  the architect decides so in an ADR.
- **DI is about the direction of dependencies, not about a framework.** The mechanism is a constructor or
  function parameter. No container, no decorators, no reflection.
- **Decision test:** is the area's logic more complex than CRUD and validation? No: actions, SQL
  and plain data are enough. Yes: aggregate boundaries are recorded in an ADR.

## 2 · Ubiquitous language and glossary

- **One concept, one word.** The same domain concept has the same name in code (types, functions,
  variables), in the API contract, in the UI and in the documentation.
- **Source of truth:** the glossary in `docs/domain.md` (§ 1 of the guide). It is created in step 4 of the process,
  before the first line of code.
- **A synonym or abbreviation is a bug**, fixed by renaming. Typical drift: "User" on the
  server, "Account" on the client, "Customer" in reports. Three words, three models, three sets of bugs.
- **Naming language:** identifiers in English per the glossary; a client's domain term that would
  lose precision in translation may stay, but only as a written rule in the README (§ 2 item 8).
- **Guard:** S14 checks the naming glossary; a new term goes into the glossary first, then into code.

| Glossary column | Example |
|---|---|
| Term (identifier) | `Order` |
| Meaning in one sentence | a customer order from submission to delivery |
| Area (owner) | `orders` |
| States and transitions | `draft → placed → shipped`, `placed → cancelled` |
| Forbidden synonyms | Purchase, Request, Ord |

## 3 · Areas as bounded contexts

- **Bounded context = area `<area>/`.** An explicit boundary within which one model
  and one glossary apply. Areas are created in step 5 of the process (§ 3).
- **One area, one owner.** The model is not shared between areas; each has its own types,
  even if they are named similarly.
- **Communication through a published interface:** an area calls the actions of another area, never its
  `*Sql.ts`, `*ReadModels.ts` or tables (§ 2 item 3, guard S4).
- **The context map** is drawn as soon as two or more areas talk to each other. It belongs in an ADR.

| Map pattern | When | In this structure |
|---|---|---|
| **Anti-corruption layer** (default) | a foreign model must not leak inside | an adapter in `integrations/` translates the foreign shape into domain types |
| **Published language** | multiple consumers of the same data | a schema in `packages/contracts/` |
| **Shared kernel** | a small, stable core shared deliberately | a type in `domain/` (e.g. `Money`), changed only with the consent of all owners |

## 4 · Tactical building blocks

- **Value object** (default choice): immutable data without identity, compared by value.
  `Money`, `Address`, `DateRange`, `Email`. No setters, a change returns a new instance.
- **Entity:** an object with an identity that survives state changes. `Order`, `Payment`, `User`.
  It has an id, a lifecycle and behavior (transition rules), not just getters.
- **Aggregate:** a cluster of entities and value objects with one root and one consistency boundary.
  Changes go only through the root, the inside is not touched. Small: the fewer entities, the fewer conflicts.
- **One transaction, one aggregate.** A need to change two aggregates at once means a domain
  event and eventual consistency, not a longer transaction.
- **Domain event:** a fact in the past tense (`OrderPlaced`, `PaymentFailed`). Use it for side
  effects across an aggregate or area boundary. The handler is idempotent (the same event twice
  must not make two changes).

```ts
// domain/money.ts: value object, immutable, equality by value
export type Currency = "CZK" | "EUR";

export interface Money {
  readonly amountMinor: number;
  readonly currency: Currency;
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) {
    throw new Error(`Currency mismatch: ${left.currency} vs ${right.currency}`);
  }
  return { amountMinor: left.amountMinor + right.amountMinor, currency: left.currency };
}
```

```ts
// domain/order.ts: aggregate root, all changes go through pure functions on the root
export type OrderStatus = "draft" | "placed" | "cancelled";

export interface OrderLine { readonly productId: string; readonly quantity: number; readonly price: Money; }
export interface Order { readonly id: string; readonly status: OrderStatus; readonly lines: readonly OrderLine[]; }
export interface OrderPlaced { readonly type: "OrderPlaced"; readonly orderId: string; readonly total: Money; }

export function placeOrder(order: Order): { order: Order; event: OrderPlaced } {
  if (order.status !== "draft") throw new Error(`Order ${order.id} is not a draft`);
  if (order.lines.length === 0) throw new Error(`Order ${order.id} has no lines`);
  const total = order.lines.map((line) => line.price).reduce(addMoney);
  return { order: { ...order, status: "placed" }, event: { type: "OrderPlaced", orderId: order.id, total } };
}
```

## 5 · DDD in the project structure

The guide does not use the names controller, service, repository. DDD tactical building blocks map onto its layers:

| DDD element | Classic layer | Where it lives | Rule |
|---|---|---|---|
| Value object, entity, aggregate, domain service | domain | `server/src/domain/` | pure TypeScript, zero dependencies on DB, network, framework (S3) |
| Use case, transaction boundary | application / service | `<area>/<area>Actions.ts` | loads the aggregate, calls the rule, saves, emits the event |
| Repository (per aggregate root) | infrastructure / repository | `<area>/<area>Sql.ts` | returns the whole aggregate, not half of it; not one set of functions per table |
| Reads for screens | query service | `<area>/<area>ReadModels.ts` | may return flat projections, the aggregate does not bypass writes |
| Input, validation | controller | `http/<area>Router.ts` | no domain logic, only actions and read models |
| Foreign system adapter, ACL | infrastructure | `integrations/` | translation of the foreign model into domain types |
| Glossary, states, transitions | documentation | `docs/domain.md` | the single source of names |
| Aggregate boundaries, context map | decision | `docs/adr/` | tactical DDD only with an ADR |

- **A rule in one place** (§ 2 item 4): a stable structural rule as a DB constraint,
  a changing business policy in `domain/`. Never both.
- **The repository interface belongs to the domain, the implementation to `<area>Sql.ts`.** In practice the
  parameter type in actions is enough (§ 7), a separate interface file only for a shared boundary.
- **An area without complex logic does not need `domain/`.** Actions, SQL and plain data are a valid target.

## 6 · SOLID in moderation

| Principle | Rule | When NOT |
|---|---|---|
| **SRP** (most important) | one module = one reason to change; two people change a file for two different reasons, so split it | do not split into shallow modules: a class with 1 to 2 methods called from a single place is fragmentation, not SRP |
| **OCP** | behavior is added with new code, not by modifying a **shared** interface | internal code is simply modified; do not build extension points in advance (YAGNI) |
| **LSP** | every implementation fulfills the whole interface contract | never `throw new Error("not implemented")`, `null` for a required method, a narrower input or a wider output |
| **ISP** | an interface has at most 5 methods, otherwise split by consumer need | interfaces only at external boundaries (§ 7), not for internal helpers |
| **DIP** | the high level depends on an abstraction, not on a concrete DB or client | fully covered by § 7; inside an area a direct import is enough |

- **Deep module:** substantial functionality behind a simple interface. Shallowness test: if the module
  disappeared and its logic just moved one level up, it was unnecessary.
- **Fragmentation signals:** a feature requires reading 10 or more files; adding a field means
  a change in 5 or more files; a class only delegates to four subclasses.
- **Suspect names:** `Manager`, `Handler`, `Processor`, `Utils`, `Helper`, bare `Service`.
  Dumping grounds for responsibilities; split by actual purpose.
- **Strategy pattern from 4 variants.** Two variants are an `if` or a `switch`, the third is a signal,
  the fourth is a reason.
- **Duplication:** a little copying is better than a little dependency. Abstract once the pattern
  repeats 3 times and the variants share structure; never for fewer than 15 lines.

```ts
// SRP: split by reason to change, not by line count
// Bad: one module prices, persists and emails (three reasons to change)
// Good: pricing rule in domain/, persistence in ordersSql.ts, email via an injected port

// OCP + "strategy at 4+ variants": two variants stay a switch
const COURIER_FEE_MINOR = 9900;

export function shippingFee(method: "pickup" | "courier", subtotal: Money): Money {
  switch (method) {
    case "pickup": return { amountMinor: 0, currency: subtotal.currency };
    case "courier": return { amountMinor: COURIER_FEE_MINOR, currency: subtotal.currency };
  }
}
```

```ts
// ISP + LSP: small interface per consumer, every implementation honors all of it
export interface PaymentGateway {
  charge(orderId: string, amount: Money): Promise<{ paymentId: string }>;
  refund(paymentId: string): Promise<void>;
}
```

## 7 · Dependency injection without a framework

- **Injection by parameter.** A class receives its dependencies in the constructor; a functional module receives them
  as a `deps` object in a factory function. The dependency is visible in the signature.
- **Composition root:** the single place that imports concrete implementations, creates them and
  wires them together. In the guide's structure this is `app.ts` (it composes the routers and their dependencies).
- **Interfaces only at external boundaries:** DB, cache, HTTP clients of foreign systems, queue,
  e-mail, file storage. That is, everything that crosses the process boundary or has a timeout and retries.
  Never for formatters, validators and internal helpers.
- **At most 5 injected dependencies.** More is not a DI problem but an SRP one: split the module.
- **Wiring depth at most 3** (A needs B needs C). A deeper chain indicates a bad structure.
- **Forbidden:** service locator (`container.resolve(...)`), property injection, ambient context,
  global singletons (`getInstance()`), DI containers and `@Inject` decorators, importing
  `db` directly in business logic.

```ts
// orders/ordersActions.ts: function injection via a deps object
export interface OrdersDeps {
  readonly orders: OrdersStore;          // implemented in ordersSql.ts
  readonly payments: PaymentGateway;     // implemented in integrations/
  readonly publish: (event: OrderPlaced) => Promise<void>;
}

export interface OrdersStore {
  load(orderId: string): Promise<Order>;
  save(order: Order): Promise<void>;
}

export function createOrdersActions(deps: OrdersDeps) {
  return {
    async place(orderId: string): Promise<Order> {
      const current = await deps.orders.load(orderId);
      const { order, event } = placeOrder(current);
      await deps.payments.charge(order.id, event.total);
      await deps.orders.save(order);
      await deps.publish(event);
      return order;
    },
  };
}
```

```ts
// app.ts: composition root, the only place with concrete implementations
const pool = createPool(config.database);
const ordersActions = createOrdersActions({
  orders: createOrdersSql(pool),
  payments: createPaymentGatewayClient(config.payments),
  publish: createEventPublisher(pool),
});
app.use("/orders", createOrdersRouter(ordersActions));
```

- **Test seam = parameter.** A test composes the same wiring with fakes (in-memory store, silent
  logger). If it cannot be tested by swapping an argument, the design is wrong.
- **No `jest.mock` / `vi.mock` of internal modules** and no overriding of global state. A module
  mock is a symptom of missing injection.

```ts
// ordersActions.test.ts: same wiring, fake implementations
const saved: Order[] = [];
const actions = createOrdersActions({
  orders: { load: async () => draftOrder, save: async (order) => { saved.push(order); } },
  payments: { charge: async () => ({ paymentId: "pay-1" }), refund: async () => {} },
  publish: async () => {},
});
```

## 8 · Adoption by milestone

| Milestone | DDD | SOLID | DI |
|---|---|---|---|
| **M0 PoC** | only the ubiquitous language from the specification | only SRP and the deep module test | direct imports are enough, no interfaces |
| **M1 MVP** | + areas as bounded contexts, value objects for key types | + OCP for shared interfaces | + interfaces for external boundaries, injection, composition root |
| **M2 v1.0** | + full tactical DDD where there is an ADR: aggregates, events | + the whole checklist, extension points in an ADR | + all external boundaries abstracted, tests with fakes |

## 9 · When to use a technique, when it is unnecessary

| Technique | Use when | Unnecessary when |
|---|---|---|
| Glossary | always | never |
| Areas and boundaries | always, from the first area | never |
| Context map | 2 or more areas talk to each other | a single area |
| Value object | the type has rules (currency, range, format) | a bare string without rules (note, description) |
| Entity with behavior | the state has transitions and rules | the record is only read and saved |
| Aggregate | multiple objects must stay consistent at once | CRUD and validation; a table is not an aggregate |
| Domain event | a side effect across an aggregate or area boundary | an effect inside one transaction of one aggregate |
| Interface (port) | a process boundary: DB, foreign API, queue, e-mail | internal helper, formatter, validator |
| Strategy pattern | 4 or more variants with a common structure | 2 to 3 variants: `switch` |
| Abstracting duplication | 3 repetitions with shared structure | fewer than 15 lines or 2 occurrences |
| DI container | never | always; a composition root is enough |

## Checklist

- [ ] Every new domain name is in the glossary `docs/domain.md`, without synonyms and abbreviations.
- [ ] Code, contract, UI and documentation use the same word for the same concept.
- [ ] An area does not touch another area's `*Sql.ts`, `*ReadModels.ts` or tables, only its actions.
- [ ] A foreign system is translated into domain types in an adapter in `integrations/`.
- [ ] Tactical DDD (aggregates, events) has a decision in an ADR; without one, only actions, SQL and data.
- [ ] Value objects are immutable (`readonly`, no setters, a change returns a new value).
- [ ] One transaction changes at most one aggregate; changes go through the root.
- [ ] Domain events are in the past tense and their handlers are idempotent.
- [ ] `domain/` does not import DB, network, HTTP or a framework.
- [ ] `<area>Sql.ts` returns the whole aggregate, not a function per table.
- [ ] The router contains no domain logic; a business rule is not in SQL or in an action if it belongs in `domain/`.
- [ ] No name `Manager`, `Handler`, `Processor`, `Utils`, `Helper`.
- [ ] No shallow module that only delegates; no feature spanning 10 or more files without a reason.
- [ ] Interfaces have at most 5 methods and every implementation fulfills all of them.
- [ ] Strategy, factory or visitor pattern only with 4 or more variants and with the architect's consent.
- [ ] Dependencies enter by parameter; a module has no more than 5 injected dependencies.
- [ ] Concrete implementations are imported only in `app.ts` (composition root).
- [ ] Interfaces exist only at external boundaries.
- [ ] Tests swap dependencies by argument, not with `jest.mock` / `vi.mock` of internal modules.
- [ ] File up to 300 lines, function up to 50; split by responsibility.

## Anti-patterns

- **DDD for CRUD:** aggregates and roots over a form and a table. Actions, SQL and validation are enough.
- **Anemic model:** an entity with only getters and setters, all rules in actions, while the area
  does have complex logic.
- **Aggregate per table:** an aggregate is a consistency boundary, not a table mapping.
- **Transaction across multiple aggregates:** use an event and eventual consistency instead.
- **Shared database between areas:** areas talk through actions and contracts, not through another area's tables.
- **Synonyms across layers:** "User", "Account" and "Customer" for one thing.
- **Tactical DDD without a decision:** the implementation prescribes aggregates to itself.
- **`AbstractFactoryStrategyBuilder`:** overdone SOLID is a violation of SOLID.
- **50 small files instead of 5 deep modules:** SRP understood as "one function per class".
- **Strategy for 2 variants, extension points in advance:** YAGNI, add at the third variant.
- **Abstracting 10 lines of duplication:** the abstraction costs more than the copy.
- **Designing for reuse before the first use:** first make it work for one consumer.
- **`import { db } from "../db"` in business logic:** a hidden dependency, untestable.
- **`container.resolve(...)`, `@Inject`, `getInstance()`:** a hidden dependency graph.
- **A module with 8 or more dependencies:** an SRP problem, not a DI one; split it.
- **`IStringFormatter`:** an interface for everything is over-abstraction.
- **Tests via module mocking:** the design does not support injection; fix the design, not the test.
