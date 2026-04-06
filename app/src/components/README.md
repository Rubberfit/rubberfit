# components/

Shared UI components used across the application.

## Files

- **simple-icon.tsx** -- Renders SVG icons from the `simple-icons` library as React components

## Subdirectories

### auth/

- **ProtectedRoute.tsx** -- Route guard that checks authentication and RBAC permissions, redirects unauthorized users

### common/

- **confirmation-dialog.tsx** -- Reusable confirmation dialog built on AlertDialog for destructive action prompts

### ui/

shadcn/ui component library. Primitives used throughout the app:

alert, alert-dialog, avatar, badge, button, button-group, calendar, card, chart, checkbox, collapsible, command, date-range-picker, dialog, direction, dropdown-menu, empty, field, form, input, input-group, item, kbd, label, native-select, pagination, popover, progress, select, separator, sheet, sidebar, skeleton, sonner (toasts), spinner, switch, table, tabs, textarea, toggle, toggle-group, tooltip
