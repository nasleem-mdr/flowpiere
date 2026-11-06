// src/shared/components/common/PriceInput.jsx
import { useState, useEffect } from 'react';
import { formatPriceDisplay, parsePriceInput } from '@/utils/currency';

const PriceInput = ({ value, onChange, style, ...rest }) => {
  const [localText, setLocalText] = useState(formatPriceDisplay(value));
  const [isFocused, setIsFocused] = useState(false);

  // sinkron dari luar hanya kalau input sedang TIDAK fokus,
  // supaya nggak nimpa ketikan user yang lagi berlangsung
  useEffect(() => {
    if (!isFocused) setLocalText(formatPriceDisplay(value));
  }, [value, isFocused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localText}
      onFocus={(e) => { setIsFocused(true); e.target.select(); }}
      onBlur={() => {
        setIsFocused(false);
        setLocalText(formatPriceDisplay(value)); // rapikan tampilan final
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setLocalText(raw); // tampilkan mentah selama fokus, biar bisa ngetik koma
        onChange(parsePriceInput(raw));
      }}
      style={style}
      {...rest}
    />
  );
};

export default PriceInput;