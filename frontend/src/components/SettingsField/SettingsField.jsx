import styles from './SettingsField.module.css'

/**
 * Dynamic settings field component
 * Renders appropriate input type based on field config
 */
function SettingsField({ field, value, onChange, instanceData }) {
  const {
    name,
    label,
    type,
    placeholder,
    help,
    options,
    min,
    max,
    maxLength,
    showWhen,
    transform
  } = field

  // Check conditional visibility
  if (showWhen && instanceData) {
    const { field: condField, value: condValue } = showWhen
    // Support array of fields (show if ANY field matches the value)
    if (Array.isArray(condField)) {
      const anyMatch = condField.some(f => instanceData[f] === condValue)
      if (!anyMatch) {
        return null
      }
    } else {
      if (instanceData[condField] !== condValue) {
        return null
      }
    }
  }

  // Transform value for display if needed
  const displayValue = transform?.toDisplay ? transform.toDisplay(value) : value

  const handleChange = (newValue) => {
    // Transform value from display if needed
    const storeValue = transform?.fromDisplay ? transform.fromDisplay(newValue) : newValue
    onChange(name, storeValue)
  }

  const renderInput = () => {
    switch (type) {
      case 'text':
      case 'password':
        return (
          <input
            type={type}
            id={name}
            value={displayValue || ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            className={styles.input}
          />
        )

      case 'number':
        return (
          <input
            type="number"
            id={name}
            value={displayValue ?? ''}
            onChange={(e) => handleChange(e.target.value === '' ? '' : Number(e.target.value))}
            min={min}
            max={max}
            className={styles.numberInput}
          />
        )

      case 'checkbox':
        return (
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              id={name}
              checked={displayValue ?? false}
              onChange={(e) => handleChange(e.target.checked)}
              className={styles.checkbox}
            />
            <span className={styles.checkboxText}>{label}</span>
          </label>
        )

      case 'select':
        return (
          <select
            id={name}
            value={displayValue || options?.[0]?.value || ''}
            onChange={(e) => handleChange(e.target.value)}
            className={styles.select}
          >
            {options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )

      default:
        return null
    }
  }

  // Checkbox renders its own label
  if (type === 'checkbox') {
    return (
      <div className={styles.field}>
        {renderInput()}
        {help && <p className={styles.help}>{help}</p>}
      </div>
    )
  }

  return (
    <div className={styles.field}>
      <label htmlFor={name} className={styles.label}>
        {label}
      </label>
      {renderInput()}
      {help && <p className={styles.help}>{help}</p>}
    </div>
  )
}

export default SettingsField
