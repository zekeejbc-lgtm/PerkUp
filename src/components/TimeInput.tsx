import React, { useEffect, useState } from "react";
import { formatTime12Hour, parseTime12Hour } from "../lib/dateTime";

type TimeInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

export function TimeInput({ value, onChange, onBlur, ...props }: TimeInputProps) {
  const [displayValue, setDisplayValue] = useState(() => formatTime12Hour(value));

  useEffect(() => setDisplayValue(formatTime12Hour(value)), [value]);

  const commit = () => {
    const parsed = parseTime12Hour(displayValue);
    if (parsed) {
      onChange(parsed);
      setDisplayValue(formatTime12Hour(parsed));
    } else {
      setDisplayValue(formatTime12Hour(value));
    }
  };

  return (
    <input
      {...props}
      type="text"
      inputMode="text"
      value={displayValue}
      placeholder="9:00 AM"
      pattern="(0?[1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM|am|pm)"
      title="Enter a time such as 9:00 AM"
      onChange={(event) => setDisplayValue(event.target.value)}
      onBlur={(event) => {
        commit();
        onBlur?.(event);
      }}
    />
  );
}
