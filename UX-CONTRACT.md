# MainTrack inventory UI contract

Scope: Owner-approved reference design applies only to inventory. Arabic RTL; codes LTR; native platform select popup and file picker are intentional. Search queries are transient session state, not URLs or persistent browser storage. Explicit search/Enter is intentional to avoid repeated remote scans; clear invalidates pending result rendering immediately.

| Capability | Owner | Contract / verification |
| --- | --- | --- |
| Navigation | existing MainTrack show(v) and v6 | Sidebar order/roles unchanged; menu_roles browser regression |
| Search/filter/sort | inventory-presentation.mjs and inventory-ui.mjs | Collect all version-pinned API pages before enabling filters; complete counts; local load-more12; presentation tests |
| Session/permissions | inventory-client.mjs + MainTrack server verifier | Existing opaque bearer; backend only trusts server role; Owner mutation guards unchanged |
| Approval | owner-review-pagination.mjs + inventory-client.mjs | Complete diff receipt, human review checkbox, extra large-absence acknowledgement; never auto-publish |
| Details | native dialog in inventory | Details modal and mobile filter sheet: focus, Escape, inert backdrop, restore trigger focus; browser test |
| Status/copy | inventory inline live region | Same status region for search/import errors and copy result; no native alert/confirm |
| Select | native select | OS-owned popup geometry accepted; labels/keyboard preserved |
| Scroll | existing app shell; scoped inventory table/detail overflow | Natural page height; bounded diff table; main forms unchanged |
| Error/recovery | existing transport and inline status | Uncertain write outcome never automatically retried; session change suppresses stale rows |

Business sources: `ops/maintrack/inventory/backend/src/domain.mjs` (roles), `inventory-service.mjs` (review and publish), `postgres-store.mjs` (approved snapshot/paging), and approved/archive SQL contract. Missing quantities stay null and descriptions/metadata stay source-derived. Archived versions are retained; imports compare with latest approved only.

## Exact inventory source contract
- Use the supplied HTML directly; do not rebuild icons, cards, facets, or search typography.
- Load authenticated current sealed inventory with matching filename and actual approval timestamp. Never embed private stock in public assets or fall back to demo stock. Owner authorized an explicit account-scoped IndexedDB copy on 2026-10-24; it is labeled during checking/offline use.
- Search and unit matching use the original V9 engine. Filters derive from the current result family.
- Keep original result HTML and screenshot parity at equal viewport and synthetic data. Test both 390px and 1280px.
- Preserve Owner upload → complete server diff → explicit confirmation → publish. Make every diff row available; restore stages a review and never auto-publishes.
- Preserve the iframe while navigating within the same account; suspend hidden-page work. Clear the iframe and local cache on logout/account change. Keep credentials in the parent client.

## Owner Team Ledger
- Existing `show('admin')` remains navigation owner; Accounts is default; no sidebar addition.
- `team-ledger.js` owns Owner ledger tabs, bounded server pages, 300ms transient search, explicit clear/refresh and inline live status. No polling, URL employee IDs or persistent data caches.
- Existing transport `api()` and opaque-session backend authorization are reused. New read handlers require `users.manage`; personal summary remains self-only.
- Current balance cards use canonical accountSummary projection; year filters activity and does not invent historical opening balances.
- Native year select intentionally reuses platform-owned popup behavior. Details are inline pages with a back button, not modal overlays. Table transforms to reference cards on phones.

## Approved cache and numeral correction (2026-10-24)
Use one complete prepared local snapshot keyed by project/account, schema and search-engine stamp. Validate version ID AND generation on re-entry (at most once per minute automatically while visible); refresh/reconnect bypass that interval. Preserve usable previous data on transport failure, visibly label cached status, clear on authentication denial. Cache failure falls back to the existing complete authenticated load. No background preload during sign-in. Team ledger quantities and times use Latin digits (ar-EG-u-nu-latn), preserving Cairo typography and all domain calculations.
