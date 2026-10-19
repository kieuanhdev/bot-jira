import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-2xs font-semibold transition-colors gap-1",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        neutral: "border-transparent bg-muted text-foreground",
        outline: "text-foreground border-border",
        success: "border-success/20 bg-success/12 text-success",
        warning: "border-warning/20 bg-warning/12 text-warning",
        danger: "border-destructive/20 bg-destructive/12 text-destructive",
        info: "border-info/20 bg-info/12 text-info",
        "primary-soft": "border-primary/20 bg-primary-soft text-primary-soft-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
