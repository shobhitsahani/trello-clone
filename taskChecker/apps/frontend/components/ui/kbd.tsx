import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const kbdVariants = cva(
  "pointer-events-none inline-flex h-5 w-fit items-center justify-center gap-1 rounded-md border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground select-none [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      size: {
        sm: "h-4 px-1 text-[9px]",
        md: "h-5 px-1.5 text-[10px]",
        lg: "h-6 px-2 text-xs",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

function Kbd({
  className,
  size,
  ...props
}: React.ComponentProps<"kbd"> & VariantProps<typeof kbdVariants>) {
  return (
    <kbd
      data-slot="kbd"
      data-size={size}
      className={cn(kbdVariants({ size }), className)}
      {...props}
    />
  )
}

export { Kbd, kbdVariants }
