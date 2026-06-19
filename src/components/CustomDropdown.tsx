import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface CustomDropdownProps {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function CustomDropdown({ options, value, onChange, placeholder = "Select...", className = "" }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        className="flex min-h-8 w-full cursor-pointer items-center justify-between rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs transition-colors hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={selectedOption ? "font-medium text-gray-900 dark:text-white" : "text-gray-500"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-md animate-in fade-in slide-in-from-top-2 dark:border-gray-700 dark:bg-gray-800">
          <div className="max-h-60 overflow-y-auto p-1">
            {options.map((option) => (
              <div
                key={option.value}
                className={`flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${
                  value === option.value
                    ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span>{option.label}</span>
                {value === option.value && <Check className="h-3.5 w-3.5" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
