# Component specs

One section per component. All six fields are required. Every token referenced must exist in `design-tokens.json`. The shape is versioned: `design-tokens-v1`.

## Button

**Purpose:** triggers one action. Not for navigation (use Link).

**Props:**

| Prop     | Type                             | Default   | Notes                  |
| -------- | -------------------------------- | --------- | ---------------------- |
| variant  | `primary \| secondary \| danger` | `primary` |                        |
| size     | `sm \| md`                       | `md`      |                        |
| disabled | boolean                          | false     |                        |
| loading  | boolean                          | false     | blocks repeated clicks |

**States:** default, hover, active, disabled, error (loading shows a spinner and keeps the width).

**Accessibility:** native button element, visible focus ring, label text or `aria-label`, text contrast WCAG 2.1 AA, disabled state announced.

**Tokens:** `color.primary.500`, `color.primary.600`, `color.neutral.0`, `space.2`, `space.4`, `radius.md`, `font.scale.sm`, `font.weight.medium`, `motion.duration.fast`.

**Variants:** primary (main action, one per view), secondary (other actions), danger (destructive, always confirmed).
