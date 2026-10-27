import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50', {
  variants: { variant: { default: 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]', outline: 'border border-[#e2e8f0] bg-white text-[#0f172a] hover:bg-[#f8fafc]', ghost: 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]', secondary: 'bg-[#eff6ff] text-[#2563eb] hover:bg-[#dbeafe]' }, size: { default: 'h-10 px-4', sm: 'h-9 rounded-lg px-3 text-xs', lg: 'h-12 px-5' } }, defaultVariants: { variant: 'default', size: 'default' }
})

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => { const Comp = asChild ? Slot : 'button'; return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} /> })
Button.displayName = 'Button'
