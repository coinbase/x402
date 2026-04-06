import { useEffect, useMemo, useRef, useState } from "react";

type WalletSelectOption = {
  value: string;
  label: string;
};

type WalletSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: WalletSelectOption[];
  placeholder?: string;
};

export function WalletSelect({
  value,
  onChange,
  options,
  placeholder = "Select a wallet",
}: WalletSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = useMemo(
    () => options.find(option => option.value === value),
    [options, value],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="wallet-select" ref={containerRef}>
      <button
        type="button"
        className="input wallet-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(prev => !prev)}
      >
        <span>{selectedOption?.label || placeholder}</span>
      </button>
      {isOpen && (
        <div className="wallet-select-menu" role="listbox">
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`wallet-select-option ${option.value === value ? "selected" : ""}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
