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
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar bg-[#f8fafc] p-3 [--cell-size:2.5rem] border-2 border-[#1e293b] rounded-none shadow-[4px_4px_0_0_#1e293b]",
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
        root: cn("w-fit", defaultClassNames.root),
        months: cn("relative flex flex-col gap-4 md:flex-row", defaultClassNames.months),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          "inline-flex h-8 w-8 select-none items-center justify-center rounded-none border-2 border-[#1e293b] bg-white p-0 text-[#1e293b] transition-colors hover:bg-[#2563eb] hover:text-white aria-disabled:opacity-40",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          "inline-flex h-8 w-8 select-none items-center justify-center rounded-none border-2 border-[#1e293b] bg-white p-0 text-[#1e293b] transition-colors hover:bg-[#2563eb] hover:text-white aria-disabled:opacity-40",
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
          "select-none font-extrabold uppercase tracking-[0.18em] text-[#1e293b]",
          captionLayout === "label"
            ? "text-sm"
            : "[&>svg]:text-muted-foreground flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5",
          defaultClassNames.caption_label,
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex border-2 border-[#1e293b] bg-[#1e293b]", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 select-none rounded-none py-1.5 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#f8fafc]",
          defaultClassNames.weekday,
        ),
        week: cn(
          "flex w-full border-x-2 border-b-2 border-[#1e293b] even:bg-[#2563eb]/5",
          defaultClassNames.week,
        ),
        week_number_header: cn("w-(--cell-size) select-none", defaultClassNames.week_number_header),
        week_number: cn(
          "text-muted-foreground select-none text-[0.8rem]",
          defaultClassNames.week_number,
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full select-none border-r-2 border-[#1e293b] p-0 text-center last:border-r-0",
          defaultClassNames.day,
        ),
        range_start: cn("bg-[#2563eb]/20", defaultClassNames.range_start),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("bg-[#2563eb]/20", defaultClassNames.range_end),
        today: cn(
          "[&_button]:bg-[#1e293b] [&_button]:font-extrabold [&_button]:text-[#f8fafc] [&_button]:rounded-none data-[selected=true]:[&_button]:bg-[#1d4ed8]",
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
          return <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />;
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
        DayButton: CalendarDayButton,
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
  ...props
}: React.ComponentProps<typeof DayButton>) {
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
        "flex aspect-square h-auto w-full min-w-(--cell-size) flex-col justify-center gap-0.5 rounded-none font-bold tabular-nums leading-none text-[#1e293b] transition-colors duration-150",
        "hover:bg-[#2563eb] hover:text-white",
        "data-[selected-single=true]:bg-[#2563eb] data-[selected-single=true]:text-white data-[selected-single=true]:font-extrabold data-[selected-single=true]:hover:bg-[#1d4ed8] data-[selected-single=true]:hover:text-white",
        "data-[range-middle=true]:bg-[#2563eb]/15 data-[range-middle=true]:text-[#1e293b] data-[range-start=true]:bg-[#1d4ed8] data-[range-start=true]:text-white data-[range-end=true]:bg-[#1d4ed8] data-[range-end=true]:text-white",
        "group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-2 group-data-[focused=true]/day:ring-[#1e293b] [&>span]:text-[9px] [&>span]:font-extrabold [&>span]:uppercase [&>span]:tracking-widest [&>span]:opacity-80",
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
