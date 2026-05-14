"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-oklch(0.97 0 0) dark:bg-oklch(0.269 0 0)">
      <SliderPrimitive.Range className="absolute h-full bg-oklch(0.205 0 0) dark:bg-oklch(0.922 0 0)" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-oklch(0.205 0 0) bg-oklch(1 0 0) ring-offset-oklch(1 0 0) transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oklch(0.708 0 0) focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-oklch(0.922 0 0) dark:bg-oklch(0.145 0 0) dark:ring-offset-oklch(0.145 0 0) dark:focus-visible:ring-oklch(0.556 0 0)" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
