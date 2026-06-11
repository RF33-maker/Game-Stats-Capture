---
name: Swish Stats toasts use sonner
description: Which toast system is authoritative in the swish-stats artifact
---

The swish-stats artifact standardizes on **sonner** for toasts (`import { toast }
from "sonner"`). Sonner's `<Toaster />` (wrapped in `components/ui/sonner.tsx`) is
mounted in `main.tsx`.

**Why:** Historically a shadcn `<Toaster />` was the only provider mounted while
every page called sonner's `toast()`, so notifications silently never rendered.
Mounting sonner's Toaster fixed it app-wide.

**How to apply:** Add new toasts with sonner's `toast()`. Do not reintroduce the
shadcn `useToast` hook for new code — keep one toast system to avoid silent
no-op notifications.
