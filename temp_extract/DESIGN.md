---
name: Obsidian Board
colors:
  surface: '#14121d'
  surface-dim: '#14121d'
  surface-bright: '#3a3744'
  surface-container-lowest: '#0f0d18'
  surface-container-low: '#1c1a25'
  surface-container: '#201e2a'
  surface-container-high: '#2b2834'
  surface-container-highest: '#36333f'
  on-surface: '#e6e0f0'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#e6e0f0'
  inverse-on-surface: '#312f3b'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#d2bbff'
  on-secondary: '#3f008e'
  secondary-container: '#6001d1'
  on-secondary-container: '#c9aeff'
  tertiary: '#cebdff'
  on-tertiary: '#381385'
  tertiary-container: '#9b7fed'
  on-tertiary-container: '#31057e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d2bbff'
  on-secondary-fixed: '#25005a'
  on-secondary-fixed-variant: '#5a00c6'
  tertiary-fixed: '#e8ddff'
  tertiary-fixed-dim: '#cebdff'
  on-tertiary-fixed: '#21005e'
  on-tertiary-fixed-variant: '#4f319c'
  background: '#14121d'
  on-background: '#e6e0f0'
  surface-variant: '#36333f'
  canvas-base: '#0d0b14'
  surface-column: '#1a1829'
  surface-card: '#201c33'
  surface-card-hover: '#27223e'
  border-subtle: '#2e284a'
  tag-emerald-bg: rgba(16, 185, 129, 0.12)
  tag-emerald-text: '#34d399'
  tag-amber-bg: rgba(245, 158, 11, 0.12)
  tag-amber-text: '#fbbf24'
  tag-rose-bg: rgba(244, 63, 94, 0.12)
  tag-rose-text: '#fb7185'
  tag-sapphire-bg: rgba(59, 130, 246, 0.12)
  tag-sapphire-text: '#60a5fa'
  tag-violet-bg: rgba(139, 92, 246, 0.14)
  tag-violet-text: '#c4b5fd'
typography:
  headline-xl:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
  label-xs:
    fontFamily: Geist
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  column-width: 18.5rem
  board-padding: 1.5rem
  card-gap: 0.625rem
---

## Brand & Style

This design system reimagines collaborative kanban management for high-stakes leadership, engineering executives, and product directors. It discards playful, casual task-board motifs in favor of an elite, focused control plane. 

The aesthetic marries **Minimalism** and subtle **Glassmorphism** against a deep obsidian darkness. Visual density is balanced by generous negative space, crisp micro-borders, and targeted strikes of royal purple and luminous amethyst. The emotional tone is authoritative, quiet, uncompromisingly organized, and refined—evoking high-performance IDEs and command terminals rather than recreational work trackers.

## Colors

The chromatic architecture rests on an ultra-deep obsidian foundation (`#0d0b14` canvas, `#13111c` neutral anchor), preventing eye strain during sustained operation while projecting depth. 

- **Primary (`#8b5cf6`) & Secondary (`#7c3aed`)**: Used for key interactions, focus halos, and active state highlights.
- **Tertiary (`#a78bfa`)**: High-legibility accent reserved for interactive links, progress indicators, and active tab bars.
- **Surfaces (`#1a1829`, `#201c33`)**: Lifted slate-charcoal levels delivering clear visual separation between the board background, swimlane columns, and individual task cards without using harsh solid light borders.
- **Status Pills**: Tag colors (Emerald, Amber, Rose, Sapphire, Violet) leverage dark glass fills (12–14% tint opacity) paired with high-value, desaturated pastel foregrounds to preserve functional scanning without visual clutter.

## Typography

Typography relies on a crisp pairing of **Hanken Grotesk** for primary structural copy and **Geist** for metric metadata, badge labels, timestamps, and card indicators. 

Headings carry subtle negative tracking (`-0.02em` to `-0.01em`) to tighten character flow and communicate authority. Geist provides developer-grade, monoline legibility at micro sizes (`10px`–`12px`), preventing numerical drift in task counters, checklist fractions (`3/5`), and SLA deadlines. All text is tuned to warm off-white tones (`#f8fafc` primary text, `#94a3b8` secondary text) rather than pure unyielding `#ffffff` to preserve soft optical contrast against obsidian backgrounds.

## Layout & Spacing

The kanban canvas operates on a horizontal scrolling axis with a disciplined 4px/8px modular base rhythm. 

- **Columns**: Fixed standard width of `18.5rem` (`296px`) to keep task titles readable in 2 to 3 lines without horizontal bloating. Columns display an internal vertical card gap of `0.625rem` (`10px`).
- **Board Grid**: Horizontal auto-flow with a minimum canvas margin of `1.5rem` (`24px`).
- **Responsive Adaptations**:
  - **Desktop (1200px+)**: Multi-column persistent display with full drag-and-drop real estate and pinned sidebar boards.
  - **Tablet (768px – 1199px)**: Snapped horizontal swipe with visible peek (24px) for off-screen columns.
  - **Mobile (<768px)**: Segmented list views with horizontal column switcher or full-width single column stacks featuring floating action buttons.

## Elevation & Depth

Visual depth is achieved through an interplay of **Tonal Layers** and subtle **Glassmorphic Outlines**, avoiding opaque skeuomorphic bevels:

1. **Canvas (Ground)**: Deep base `#0d0b14`. Flat, motionless, absorbant.
2. **Column Tier (Layer 1)**: Surface `#1a1829`, accented with a 1px border of `#2e284a` (or `rgba(255, 255, 255, 0.05)`).
3. **Card Tier (Layer 2)**: Surface `#201c33`, framed by an ultra-thin 1px border (`rgba(255, 255, 255, 0.08)`). Renders an ambient drop shadow: `0 4px 12px -2px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.2)`.
4. **Dragging / Floating Tier (Layer 3)**: Active card elevation lifts to `#27223e`, rotated `1.5deg`, with an escalated luminous glow: `0 16px 32px -4px rgba(13, 11, 20, 0.7), 0 0 12px 1px rgba(139, 92, 246, 0.25)`, bordered in `#8b5cf6`.
5. **Modals & Overlays (Layer 4)**: Backdrop blur of `12px` overlaid with `rgba(13, 11, 20, 0.75)` and framed modal surface `#1a1829`.

## Shapes

The design system employs **Soft** geometry (`roundedness: 1`):
- **Base elements** (buttons, inputs, cards): `0.375rem` to `0.5rem` (`6px` to `8px`) radius. This geometry maintains an engineered, crisp contour.
- **Lists and Columns**: `0.5rem` (`8px`) outer radius.
- **Metadata tags & pills**: Semi-rounded pill geometry (`9999px`) to immediately delineate categorical labels from rectangular cards and form fields.

## Components

### Cards (Task Units)
- **Background & Border**: `#201c33` with 1px border of `#2e284a`. 
- **Hover Behavior**: Shift to `#27223e`, border transitions to `rgba(139, 92, 246, 0.4)`.
- **Card Content Layout**: Top row reserved for pill tags; middle block holds task title in `Hanken Grotesk` (13px, weight 500); bottom row holds metadata (due date, task checklist counter, assignee avatars in `Geist` 11px).

### Pill Tags
- **Structure**: Glassmorphic dark pills using 12% tint backgrounds.
- **Typography**: `Geist`, 11px (`label-sm`), medium weight, uppercase letter-spacing (`0.04em`).
- **Variants**: Emerald (Complete/Low Risk), Amber (In Review/Medium Risk), Rose (Blocked/Critical), Sapphire (In Progress/Architecture), Violet (Executive/Strategy).

### Buttons
- **Primary**: Solid background `#7c3aed`, text `#ffffff`, micro-shadow `0 0 10px rgba(124, 58, 237, 0.35)`. Hover to `#8b5cf6`.
- **Secondary / Ghost**: Transparent fill, 1px border `#2e284a`, text `#c4b5fd`. Hover changes surface to `rgba(139, 92, 246, 0.08)` and border to `#8b5cf6`.
- **Quick Action ("+ Add Card")**: Full width, transparent, border 1px dashed `#2e284a`, text `#94a3b8`. On hover, border switches to solid `#8b5cf6` with text `#f8fafc`.

### Columns (Swimlanes)
- **Header**: Contains title in `Hanken Grotesk` 14px weight 600, card count badge in `Geist` 11px pill (`#201c33` fill, `#a78bfa` text), and horizontal three-dot icon button.
- **Body**: Infinite scroll container with customized 4px slim obsidian scrollbars.

### Input Fields & Quick-Add
- **Input Surface**: `#13111c` with inset 1px border `#2e284a`.
- **Focus**: Border `#8b5cf6`, ambient focus ring `0 0 0 2px rgba(139, 92, 246, 0.2)`. No harsh default browser outlines.

### Checkboxes & Progress Indicators
- **Checkboxes**: 16px squares, rounded `3px`, 1px border `#2e284a`. Checked state fills `#8b5cf6` with pure white check glyph.
- **Progress Bar**: 4px track (`#13111c`), filled with gradient `#7c3aed` to `#a78bfa`.