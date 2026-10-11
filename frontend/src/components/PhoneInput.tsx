import React from 'react'

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  error,
  disabled = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value
    
    // Allow only + and digits
    input = input.replace(/[^\d+]/g, '')
    
    // Ensure it starts with +
    if (input && !input.startsWith('+')) {
      input = '+' + input
    }
    
    // Limit to reasonable length
    if (input.length > 20) {
      input = input.slice(0, 20)
    }
    
    onChange(input)
  }

  return (
    <div>
      <label className="label">
        Nomor Telepon <span className="text-status-gagal">*</span>
      </label>
      <input
        type="tel"
        value={value}
        onChange={handleChange}
        placeholder="+62812345678"
        disabled={disabled}
        className={`input ${error ? 'border-status-gagal focus:border-status-gagal' : ''}`}
      />
      {error && <p className="text-xs text-status-gagal mt-1">{error}</p>}
      <p className="text-xs text-ampas mt-1">
        Format: +countrycode+phonenumber (contoh: +62812345678)
      </p>
    </div>
  )
}
