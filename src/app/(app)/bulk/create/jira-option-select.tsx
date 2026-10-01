"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type JiraOption = {
  id: string;
  name?: string;
  value?: string;
};

type JiraOptionSelectProps = {
  options: JiraOption[];
  value?: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function JiraOptionSelect({
  options,
  value,
  onChange,
  placeholder = "Chọn…",
  disabled,
  className,
}: JiraOptionSelectProps) {
  const displayValue = options.find((o) => o.id === value)?.id ?? "";

  return (
    <Select value={displayValue || undefined} onValueChange={(v) => onChange(v || null)} disabled={disabled}>
      <SelectTrigger className={`h-8 text-xs ${className ?? ""}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.id} value={opt.id} className="text-xs cursor-pointer">
            {opt.name || opt.value || opt.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type JiraOptionMultiSelectProps = {
  options: JiraOption[];
  value?: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function JiraOptionMultiSelect({
  options,
  value = [],
  onChange,
  placeholder = "Chọn…",
  disabled,
  className,
}: JiraOptionMultiSelectProps) {
  const toggleOption = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {}}
        className="flex h-8 w-full items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate text-muted-foreground">
          {value.length === 0
            ? placeholder
            : options
                .filter((o) => value.includes(o.id))
                .map((o) => o.name || o.value || o.id)
                .join(", ")}
        </span>
      </button>
      <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md hidden group-hover:block group-focus-within:block">
        <ul>
          {options.map((opt) => {
            const checked = value.includes(opt.id);
            return (
              <li key={opt.id}>
                <label
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent transition-colors"
                  onClick={() => toggleOption(opt.id)}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOption(opt.id)}
                    className="h-3.5 w-3.5 rounded border-input"
                  />
                  <span className="truncate">{opt.name || opt.value || opt.id}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
