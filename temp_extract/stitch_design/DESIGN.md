---
name: Lumina Kanban
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#4a4455'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#7b7487'
  outline-variant: '#ccc3d8'
  surface-tint: '#732ee4'
  primary: '#630ed4'
  on-primary: '#ffffff'
  primary-container: '#7c3aed'
  on-primary-container: '#ede0ff'
  inverse-primary: '#d2bbff'
  secondary: '#6b38d4'
  on-secondary: '#ffffff'
  secondary-container: '#8455ef'
  on-secondary-container: '#fffbff'
  tertiary: '#6316cf'
  on-tertiary: '#ffffff'
  tertiary-container: '#7c3de8'
  on-tertiary-container: '#ede1ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#eaddff'
  primary-fixed-dim: '#d2bbff'
  on-primary-fixed: '#25005a'
  on-primary-fixed-variant: '#5a00c6'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#ebddff'
  tertiary-fixed-dim: '#d3bbff'
  on-tertiary-fixed: '#250059'
  on-tertiary-fixed-variant: '#5b00c5'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.06em
  label-mono:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  space-xxs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
  sidebar-width: 16rem
  rail-width: 4rem
  stream-width: 20rem
  col-min-width: 18rem
---

## Brand & Style

The design system translates high-velocity engineering telemetry and issue-tracking workflows into an ultra-precise, razor-sharp light mode environment. Drawing inspiration from dense technical interfaces like Relay Systems and Signal, this system strips away visual weight in favor of razor-thin 1px outlines, crisp zinc/slate architectural boundaries, and targeted violet accents.

The tone is understated, technical, and frictionless. It avoids loud decorative elements, relying instead on clean structural lines, micro-labels, mono-spaced tags, and dense information hierarchy to deliver absolute focus for high-throughput software and product teams.

## Colors

The color architecture is calibrated around high-clarity light canvas contrast:

- **Canvas & Surfaces**: The base canvas is clean `#ffffff`, supported by `#f8fafc` (slate-50) for secondary backdrops, sidebars, and column troughs. Nested elevated surfaces utilize pure `#ffffff` bordered with subtle structural zinc tones (`#e2e8f0` to `#cbd5e1`).
- **Primary Violet Palette**: `#7c3aed` serves as the primary focal anchor for selected navigation states, active board columns, focused search bars, and primary CTAs. `#8b5cf6` functions as a lively hover and micro-indicator state, while `#6d28d9` supplies pressed and high-contrast accessibility treatments.
- **Neutrals & Text Tiers**:
  - Primary text: Deep `#0f172a` (slate-900) for headers and card titles.
  - Secondary text: `#475569` (slate-600) for metadata, ticket IDs, and column counts.
  - Subdued text: `#94a3b8` (slate-400) for timestamps, shortcuts, and empty-state placeholders.
  - Subtle borders: Razor-thin 1px `#e2e8f0` (slate-200) structural dividers.
- **Semantic Accents**:
  - Critical/High Priority: `#ef4444` (rose-500) paired with `#fef2f2` badge fills.
  - In Progress / Warning: `#f59e0b` (amber-500) micro-indicators.
  - Success / Done: `#10b981` (emerald-500) indicator dots.

## Typography

Typography balances clean structural headers in Hanken Grotesk with rapid legibility in Inter for high-density UI elements.

- **Tracking & Proportion**: Column titles, section markers, and metadata keys use `label-caps` rendered in uppercase with deliberate `+0.06em` letter spacing for fast scannability.
- **Ticket Identifiers & Metrics**: Ticket codes (e.g., `SIG-104`) and keyboard hints (`⌘K`) leverage `label-mono` with medium weight to simulate tabular, technical stability without breaking typographic cohesion.
- **Card Hierarchy**: Card titles default to `body-md` at 13px bold/semi-bold (`#0f172a`), allowing multiple lines of technical text to remain readable within compact horizontal widths.

## Layout & Spacing

The layout employs a dense, multi-pane structural grid inspired by operations consoles:

- **Structural Composition**:
  - **Global App Bar**: 48px fixed height spanning across panels with inline command-bar search and team metadata.
  - **Left Rail & Sidebar**: 64px icon rail plus an optional collapsible 256px navigation tree (`sidebar-width`).
  - **Kanban Canvas**: Fluid horizontal multi-column viewport. Each column maintains a minimum width of `18rem` (288px) with internal item gutters set strictly to `0.5rem` (8px) for compact listing.
  - **Right Activity Stream**: Fixed 320px (`stream-width`) docked telemetry/event stream with border-left partition.
- **Adaptive Breakpoints**:
  - **Desktop (>1440px)**: Full multi-pane display (Sidebar + Canvas + Activity Stream).
  - **Laptop (1024px - 1439px)**: Activity Stream collapses into a toggleable slide-over drawer; Kanban retains horizontal drag-and-scroll.
  - **Tablet/Mobile (<1023px)**: Left sidebar collapses into an icon rail or sheet modal; Kanban canvas defaults to snap-scroll single column with horizontal indicators.

## Elevation & Depth

Visual depth is achieved through **low-contrast outlines** and subtle tonal shifts rather than heavy drop shadows:

- **Borders over Shadows**: Panels, columns, and cards are delineated using crisp `1px solid #e2e8f0` borders. On hover or selection, borders transition instantly to `#cbd5e1` or `#7c3aed`.
- **Active Column Glow**: The active or in-progress column uses a double-line accent or a 1px border colored in `#7c3aed` with an ultra-subtle tint (`rgba(124, 58, 237, 0.04)`) on its background canvas.
- **Card Hover Elevation**: Kanban cards sit on a pure white surface (`#ffffff`) over a faint slate column trough (`#f8fafc`). On mouse-over, apply a micro-depth lift of `0 2px 4px -1px rgba(15, 23, 42, 0.06), 0 1px 2px -1px rgba(15, 23, 42, 0.04)`.
- **Overlays & Command Palette**: Floating modals (`⌘K` command bar, context menus) use crisp `#ffffff` with a sharp `0 12px 24px -4px rgba(15, 23, 42, 0.08)` shadow encased within a 1px border (`#cbd5e1`).

## Shapes

The design system maintains a refined, compact geometry with `roundedness: 1` (Soft):

- **Inputs, Buttons, and Cards**: Standard corner radius is `6px` (`0.375rem`), providing a modern, technical aesthetic that avoids both blunt industrial corners and casual bubbly pills.
- **Pill Exceptions**: Micro status badges, avatar chips, and keycap shortcut badges (`kbd`) leverage full rounded-full geometry (`9999px`) to distinguish categorical tags from interactive functional blocks.
- **Column Containers**: Rounded subtly at `8px` (`0.5rem`) with top and bottom borders cleanly separating headers and footer action triggers.

## Components

### Buttons
- **Primary**: Solid `#7c3aed` fill, white `#ffffff` label, 6px border radius, 32px height (padding: 0 12px), subtle hover shift to `#6d28d9`.
- **Secondary / Ghost**: `#ffffff` background, 1px border `#e2e8f0`, slate-700 text `#334155`. Hover transitions to `#f8fafc` background with `#cbd5e1` border.
- **Quick Action ("+ Add task")**: Ghost inline button at column footers, 28px height, slate-400 text transitioning to slate-800 on hover with a dashed or transparent border.

### Kanban Cards
- **Container**: White `#ffffff` background, 1px border `#e2e8f0`, 8px-12px inner padding, 6px corner radius.
- **Header**: Ticket identifier (e.g., `SIG-104`) in `label-mono` slate-400 alongside priority tag (`HIGH` in amber or red mono text).
- **Body**: Title in `body-md` slate-900, 2-line clamp.
- **Footer**: Left-aligned comment/subtask count with micro-icons (14px) and right-aligned circular user avatar ring (20px).

### Chips & Badges
- **Status Chips**: 18px height, `label-caps` typography, 2px internal padding with a 6px indicator dot (e.g., green for Done, violet for In Progress).
- **Priority Tags**: Subdued light fills (`#fef2f2` for High with `#dc2626` text, `#f8fafc` for Low with `#64748b` text).

### Search & Command Bar
- **Global Search Input**: Integrated into the header bar, 36px height, slate-50 fill `#f8fafc` bordered by `#e2e8f0`, with inline `⌘K` keyboard chip right-aligned. Active focus outlines with a crisp 1px ring in `#7c3aed`.

### Activity Stream (Event Telemetry)
- Compact list items with 8px vertical padding, monospace timestamps (`09:55`), small outline icons (commit, message, dispatch), and direct links highlighted in `#7c3aed`.