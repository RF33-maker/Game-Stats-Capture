---
name: Swish Stats toast mismatch
description: Toast provider vs. toast caller mismatch in the swish-stats artifact
---

Pages in `artifacts/swish-stats/src` import `{ toast }` from `sonner`
(e.g. leagues, capture, settings), but `src/main.tsx` mounts only the shadcn
`<Toaster />` from `@/components/ui/toaster` — not sonner's `<Toaster />`.

**Why:** This means sonner toasts can silently fail to render. A `sonner.tsx`
wrapper exists in `components/ui/` but is not mounted in main.tsx.

**How to apply:** If toast notifications don't appear, mount sonner's `<Toaster />`
in main.tsx (or switch callers to the shadcn `useToast` hook). Stay consistent
with the existing sonner-import pattern when adding new toasts.
