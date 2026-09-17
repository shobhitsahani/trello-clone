"use client"

import {
  createContext,
  useContext,
  useId,
  useMemo,
  type ComponentProps,
} from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type FieldOrientation = "vertical" | "horizontal" | "responsive"

type FieldContextValue = {
  id: string
  invalid: boolean
  orientation: FieldOrientation
}

const FieldContext = createContext<FieldContextValue>({
  id: "",
  invalid: false,
  orientation: "vertical",
})

function useField() {
  return useContext(FieldContext)
}

const fieldVariants = cva(
  "group/field flex w-full gap-3 data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical:
          "flex-col [&>*]:w-full [&>.sr-only]:w-auto",
        horizontal:
          "flex-row items-center [&>[data-slot=field-label]]:flex-auto has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "flex-col [&>*]:w-full [&>.sr-only]:w-auto @md:flex-row @md:items-center @md:[&>*]:w-auto @md:[&>[data-slot=field-label]]:flex-auto @md:has-[>[data-slot=field-content]]:items-start @md:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
)

function Field({
  className,
  orientation = "vertical",
  invalid = false,
  ...props
}: ComponentProps<"div"> &
  VariantProps<typeof fieldVariants> & { invalid?: boolean }) {
  const id = useId()
  const contextValue = useMemo(
    () => ({ id, invalid, orientation: orientation ?? "vertical" }),
    [id, invalid, orientation]
  )

  return (
    <FieldContext.Provider value={contextValue}>
      <div
        role="group"
        data-slot="field"
        data-orientation={orientation}
        data-invalid={invalid}
        className={cn(fieldVariants({ orientation }), className)}
        {...props}
      />
    </FieldContext.Provider>
  )
}

function FieldContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "group/field-content flex flex-1 flex-col gap-1 leading-snug",
        className
      )}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: ComponentProps<"label">) {
  const { id, invalid } = useField()
  return (
    <label
      data-slot="field-label"
      data-invalid={invalid}
      htmlFor={id}
      className={cn(
        "gap-1 text-sm leading-none font-medium select-none group-data-[disabled=true]/field:pointer-events-none group-data-[disabled=true]/field:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function FieldTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-title"
      className={cn(
        "flex w-fit items-center gap-2 text-sm leading-snug font-medium",
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-sm leading-normal font-normal text-muted-foreground group-has-[[data-orientation=horizontal]]/field:text-balance",
        "last:mt-0 nth-last-2:-mt-1 [[data-variant=legend]+&]:-mt-1.5",
        "[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",
        className
      )}
      {...props}
    />
  )
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const { id } = useField()
  const content = useMemo(() => {
    if (children) return children
    if (!errors?.length) return null
    if (errors.length === 1) return errors[0]?.message
    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {errors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>
        )}
      </ul>
    )
  }, [children, errors])

  if (!content) return null

  return (
    <div
      role="alert"
      aria-live="polite"
      data-slot="field-error"
      id={`${id}-error`}
      className={cn("text-sm font-normal text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )
}

function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox]:gap-3 *:data-[slot=field-group]:gap-4",
        className
      )}
      {...props}
    />
  )
}

function FieldLegend({
  className,
  variant = "label",
  ...props
}: ComponentProps<"legend"> & { variant?: "label" | "title" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "mb-3 font-medium data-[variant=label]:text-sm data-[variant=title]:text-base",
        className
      )}
      {...props}
    />
  )
}

function FieldSeparator({
  className,
  children,
  ...props
}: ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical"
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
        className
      )}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  )
}

function FieldSet({ className, ...props }: ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "flex flex-col gap-6 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  useField,
}
