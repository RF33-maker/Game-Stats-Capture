import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-[10px] border border-transparent bg-secondary shadow-none transition-[background-color,border-color,box-shadow] duration-150 px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:bg-card focus-visible:border-[hsl(var(--border-strong))] focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
