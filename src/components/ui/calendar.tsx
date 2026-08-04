"use client";

import * as React from "react";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  fullWidth = false,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
  /** expande a grade para ocupar toda a largura/altura do container */
  fullWidth?: boolean;
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar w-full max-w-full bg-white p-2 [--cell-size:2rem] sm:p-3 sm:[--cell-size:2.5rem] rounded-xl border border-slate-200 shadow-sm",
        fullWidth && "p-0",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn(fullWidth ? "w-full" : "w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          fullWidth && "md:flex-col",
          defaultClassNames.months,
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          "inline-flex h-8 w-8 select-none items-center justify-center rounded-lg border border-slate-200 bg-white p-0 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 aria-disabled:opacity-40",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          "inline-flex h-8 w-8 select-none items-center justify-center rounded-lg border border-slate-200 bg-white p-0 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 aria-disabled:opacity-40",
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          "has-focus:border-ring border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] relative rounded-md border",
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn("bg-popover absolute inset-0 opacity-0", defaultClassNames.dropdown),
        caption_label: cn(
          "select-none font-semibold capitalize tracking-tight text-slate-900",
          captionLayout === "label"
            ? "text-sm"
            : "[&>svg]:text-muted-foreground flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5",
          defaultClassNames.caption_label,
        ),
        table: cn("w-full table-fixed border-collapse", fullWidth && "flex flex-col"),
        weekdays: cn("flex w-full", defaultClassNames.weekdays),
        weekday: cn(
          "min-w-0 flex-1 select-none py-2 text-center text-[10px] font-semibold uppercase tracking-normal text-slate-400 sm:text-xs sm:tracking-wide",
          defaultClassNames.weekday,
        ),
        week: cn(
          "flex w-full",
          defaultClassNames.week,
        ),
        week_number_header: cn("w-(--cell-size) select-none", defaultClassNames.week_number_header),
        week_number: cn(
          "text-muted-foreground select-none text-[0.8rem]",
          defaultClassNames.week_number,
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full min-w-0 select-none p-1 text-center sm:p-1.5",
          fullWidth && "aspect-auto h-10 flex-1 sm:h-11",
          defaultClassNames.day,
        ),
        range_start: cn("rounded-l-lg bg-primary/10", defaultClassNames.range_start),
        range_middle: cn("bg-primary/10", defaultClassNames.range_middle),
        range_end: cn("rounded-r-lg bg-primary/10", defaultClassNames.range_end),
        today: cn(
          "[&_button]:bg-slate-100 [&_button]:font-semibold [&_button]:text-slate-900 data-[selected=true]:[&_button]:bg-primary data-[selected=true]:[&_button]:text-primary-foreground",
          defaultClassNames.today,
        ),
        outside: cn(
          "text-slate-400 aria-selected:text-slate-400",
          defaultClassNames.outside,
        ),
        disabled: cn("text-slate-400 opacity-50", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              data-full-width={fullWidth ? "true" : undefined}
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          );
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return <ChevronLeftIcon className={cn("size-4", className)} {...props} />;
          }

          if (orientation === "right") {
            return <ChevronRightIcon className={cn("size-4", className)} {...props} />;
          }

          return <ChevronDownIcon className={cn("size-4", className)} {...props} />;
        },
        DayButton: (dayProps) => <CalendarDayButton {...dayProps} fullWidth={fullWidth} />,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  fullWidth,
  ...props
}: React.ComponentProps<typeof DayButton> & { fullWidth?: boolean }) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "flex aspect-square h-auto w-full min-w-(--cell-size) flex-col justify-center gap-0.5 rounded-lg text-sm font-medium tabular-nums leading-none text-slate-700 transition-colors duration-150",
        fullWidth && "aspect-auto h-10 min-w-0 py-2 text-sm",
        "hover:bg-slate-100 hover:text-slate-900",
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:font-semibold data-[selected-single=true]:shadow-sm data-[selected-single=true]:hover:bg-primary data-[selected-single=true]:hover:text-primary-foreground",
        "data-[range-middle=true]:bg-transparent data-[range-middle=true]:text-slate-900 data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground",
        "group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-2 group-data-[focused=true]/day:ring-primary/30 [&>span]:text-[9px] [&>span]:font-semibold [&>span]:uppercase [&>span]:tracking-widest [&>span]:opacity-80",
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
