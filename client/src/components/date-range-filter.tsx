import { useState } from "react";
import { format, subDays, startOfMonth, startOfYear } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface DateRangeFilterProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
}

const presets = [
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7days" },
  { label: "Last 30 days", value: "30days" },
  { label: "This month", value: "thisMonth" },
  { label: "This year", value: "thisYear" },
  { label: "Since July 1, 2021", value: "sinceJuly2021" },
  { label: "Custom range", value: "custom" },
];

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangeFilterProps) {
  const [preset, setPreset] = useState<string>("");

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    switch (value) {
      case "today":
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        onStartDateChange(todayStart);
        onEndDateChange(today);
        break;
      case "7days":
        onStartDateChange(subDays(today, 7));
        onEndDateChange(today);
        break;
      case "30days":
        onStartDateChange(subDays(today, 30));
        onEndDateChange(today);
        break;
      case "thisMonth":
        onStartDateChange(startOfMonth(today));
        onEndDateChange(today);
        break;
      case "thisYear":
        onStartDateChange(startOfYear(today));
        onEndDateChange(today);
        break;
      case "sinceJuly2021":
        onStartDateChange(new Date(2021, 6, 1));
        onEndDateChange(today);
        break;
      case "custom":
        break;
      default:
        onStartDateChange(undefined);
        onEndDateChange(undefined);
    }
  };

  const clearDates = () => {
    setPreset("");
    onStartDateChange(undefined);
    onEndDateChange(undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-48" data-testid="select-date-preset">
          <SelectValue placeholder="Date range" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === "custom" && (
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-36 justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                data-testid="button-start-date"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "MMM d, yyyy") : "Start date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={onStartDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground">to</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-36 justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                data-testid="button-end-date"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "MMM d, yyyy") : "End date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={onEndDateChange}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </>
      )}

      {(startDate || endDate) && (
        <Button variant="ghost" size="sm" onClick={clearDates} data-testid="button-clear-dates">
          Clear
        </Button>
      )}
    </div>
  );
}
