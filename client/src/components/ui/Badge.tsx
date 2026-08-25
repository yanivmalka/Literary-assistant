import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral'

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-info-soft text-info',
  accent: 'bg-primary-soft text-primary',
  neutral: 'bg-muted text-muted-foreground',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}
