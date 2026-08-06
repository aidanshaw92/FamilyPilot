# FamilyPilot Design System

## Design Tokens

### Colour Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `primary.500` | `#8B6FC0` | Primary buttons, active tab, links |
| `primary.100` | `#EBE0FF` | Primary backgrounds, selected chips |
| `primary.50` | `#F5F0FF` | Subtle primary tint |
| `secondary.500` | `#5CB88A` | Family Score badge, success, "Fits" |
| `secondary.100` | `#D4F0E0` | Success backgrounds |
| `accent.500` | `#6BB8E8` | Info, water/swimming categories |
| `warning.500` | `#E8A54B` | Warnings, "low stock" |
| `error.500` | `#D4756A` | Errors, closed venues |
| `background` | `#F8F7F5` | Screen background (off-white) |
| `surface` | `#FFFFFF` | Cards, sheets |
| `text.primary` | `#1A1A2E` | Headings, body |
| `text.secondary` | `#6B6B80` | Subtitles, metadata |
| `text.tertiary` | `#9B9BA8` | Placeholders, disabled |
| `border` | `#E8E6E3` | Dividers, card borders |

No harsh pure black or saturated primaries.

### Typography

Font: **Inter** (Google Fonts via Expo). Falls back to system UI.

| Style | Size | Weight | Line Height | Letter Spacing |
|-------|------|--------|-------------|----------------|
| `display` | 32 | 700 | 40 | -0.5 |
| `heading1` | 26 | 700 | 32 | -0.3 |
| `heading2` | 20 | 600 | 28 | -0.2 |
| `heading3` | 17 | 600 | 24 | 0 |
| `body` | 16 | 400 | 24 | 0 |
| `bodySmall` | 14 | 400 | 20 | 0 |
| `caption` | 12 | 500 | 16 | 0.2 |
| `label` | 13 | 600 | 18 | 0.5 |

### Spacing Scale (4px base)

`xs: 4` · `sm: 8` · `md: 12` · `lg: 16` · `xl: 20` · `2xl: 24` · `3xl: 32` · `4xl: 40` · `5xl: 48`

Screen horizontal padding: **20px** (`xl`).

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | 8 | Chips, small badges |
| `md` | 12 | Buttons, inputs |
| `lg` | 16 | Cards |
| `xl` | 20 | Large cards, bottom sheet top |
| `2xl` | 24 | Hero cards |
| `full` | 9999 | Pills, score badges |

### Shadows

```typescript
// card — subtle elevation
{ shadowColor: '#1A1A2E', shadowOffset: {0, 2}, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }

// cardHover — pressed/lifted
{ shadowColor: '#1A1A2E', shadowOffset: {0, 4}, shadowOpacity: 0.10, shadowRadius: 16, elevation: 4 }

// bottomSheet
{ shadowColor: '#1A1A2E', shadowOffset: {0, -4}, shadowOpacity: 0.08, shadowRadius: 24, elevation: 8 }
```

### Touch Targets

Minimum **44×44pt** for all interactive elements (Apple HIG).

Quick action buttons: **80×80pt** minimum visual area.

---

## Component Library

### Atoms
- `Text` — typed typography variants
- `Button` — primary / secondary / ghost / destructive
- `IconButton` — circular, 44pt
- `Badge` — status, category
- `FamilyScoreBadge` — green circle with score
- `Chip` — filter, selectable
- `Avatar` — single + `AvatarGroup` for family
- `Divider`
- `Skeleton` — loading placeholder

### Molecules
- `Card` — white surface with shadow + padding variants
- `VenueCard` — image + title + score + drive time
- `QuickActionButton` — icon + label, coloured background
- `FacilityIcon` — icon + label for toilets/café/etc.
- `DriveTimeLabel` — car icon + "12 min"
- `SectionHeader` — title + "See all" action
- `SearchBar`
- `FilterBar` — horizontal scroll chips
- `WhyRecommend` — bullet list with profile context
- `ProgressRing` — profile completion

### Organisms
- `QuickActionGrid` — 2×2 primary actions
- `RecommendationCarousel` — horizontal venue cards
- `VenueHero` — full-bleed image + gradient + score
- `FacilityGrid` — 2×4 icon grid
- `TripTimeline` — vertical day plan
- `PackingChecklist` — grouped checkable items
- `CarFitSummary` — capacity bar + status
- `BottomSheet` — map overlay list
- `TabBar` — custom styled bottom nav

---

## Animation Guidelines

| Interaction | Animation | Duration | Easing |
|-------------|-----------|----------|--------|
| Screen enter | Fade + slide up 12px | 300ms | ease-out |
| Card press | Scale to 0.97 | 150ms | spring |
| Bottom sheet | Spring from bottom | 350ms | damping 20 |
| Tab switch | Crossfade content | 200ms | ease |
| Score badge appear | Scale 0→1 + fade | 400ms | spring |
| List item stagger | Fade in, 50ms delay each | 300ms | ease-out |
| Save heart | Scale pulse + haptic | 250ms | spring |

Use `react-native-reanimated` for all animations. Avoid `Animated` from RN core.

Haptics: `Light` on button press, `Success` on save, `Warning` on error.

---

## Accessibility Guidelines

1. **Colour contrast**: All text meets WCAG AA (4.5:1 body, 3:1 large text).
2. **Dynamic Type**: All `Text` components use token sizes that scale with system font size settings.
3. **VoiceOver labels**: Every icon-only button has `accessibilityLabel` and `accessibilityRole`.
4. **Reduce Motion**: Respect `useReducedMotion()` — replace springs with fades.
5. **Focus order**: Logical top-to-bottom, left-to-right tab order.
6. **Touch targets**: 44pt minimum, 8pt spacing between adjacent targets.
7. **Error states**: Never colour-only — always icon + text.
8. **Family Score**: Announced as "Family score 98 out of 100" not just "98".

---

## Iconography

Use SF Symbols (via `expo-symbols`) on iOS, Material icons fallback on Android.

Style: **outline/light weight**, 24px default, 20px inline.

Category colours (quick actions):
- Go Outside → `secondary.500` (green)
- Indoor → `accent.500` (blue)
- Holiday → `primary.500` (purple)
- Need Now → `warning.500` (orange)
- Restaurants → `#E8927C` (coral)
- Packing → `#8B9FD4` (slate blue)
- Trips → `primary.500`
- Car Fit → `#7BAFD4` (steel blue)
