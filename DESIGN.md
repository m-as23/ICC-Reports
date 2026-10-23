---
version: alpha
colors:
  primary: '#078f8b'
  navy: '#102940'
  surface: '#ffffff'
  background: '#f3f6f9'
  text: '#1d3143'
  muted: '#6c8192'
typography:
  inventory:
    fontFamily: "Tahoma, 'Segoe UI', Arial, sans-serif"
rounded:
  card: '15px'
  panel: '18px'
---
# MainTrack interface

## Overview
MainTrack serves maintenance engineers, technicians and the Owner. The Owner approved the supplied Spare Parts Finder V9 design for the inventory screen only on 23 October 2026. Existing navigation, reporting, account and approval screens keep their established appearance.

## Colors
Inventory's runtime token owner is the scoped `#inventory` declaration in `web/maintrack/public/inventory-047.css`, adapted from the supplied HTML. Navy carries headings, teal actions, white cards and pale grey backgrounds. Stock unknown/zero remains explicitly labelled, never inferred from color.

## Typography
Inventory uses the reference's Tahoma/Segoe UI/Arial system stack. Arabic layout is RTL; codes use LTR and complete original descriptions use automatic direction. Other screens retain the existing Cairo stack.

## Layout
The existing MainTrack sidebar remains the navigation owner. Inventory has a compact heading/illustration, prominent search panel, result cards and filters. On phones filters open in a native modal bottom sheet and the decorative illustration is hidden. The list uses explicit load-more in blocks of12 after the entire pinned server result set has been collected for accurate filtering.

## Elevation & Depth
Cards use subtle borders and shadows from the reference; the item-details modal uses a right-side sheet and native dialog backdrop.

## Shapes
Cards15px, panels18px, restrained rounded buttons. No bottom navigation strip.

## Components
`inventory-icons.mjs` owns inventory's static outlined SVG family, matching the reference copy/location/code icons. `inventory-ui.mjs` owns cards, filters, details, inline status and Owner review display. `inventory-client.mjs` remains the authenticated transport/review-receipt owner. Item metadata is rendered with textContent, never injected HTML.

## Do's and Don'ts
Use the authenticated API as stock source. The reference's embedded inventory, local-only import logic, trial banners and feedback controls are not application data or features. Do not alter report/mail/session behavior for this visual change.

## Inventory source fidelity (2026-10-23 correction)
The user-supplied current-design.html is the visual authority for inventory. The previous rebuilt layout is rejected. inventory-reference.html retains its DOM and SVGs, inventory-reference.css is the exact original style block, and inventory-reference.js retains its V9 query engine, measurement rules, adaptive facets, cards, and drawers. A same-origin iframe isolates this page from MainTrack's global styles. No aesthetic changes are authorized by this correction. Only demo-specific data/Owner claims change to describe authenticated approved service behavior. The local-only import lab is replaced by the existing server review/approval flow, with pagination and explicit large-absence approval. The other MainTrack views/navigation remain outside the iframe.
