export const handleNumFieldKeyPress = (event) => {
  const { key, ctrlKey, metaKey } = event;
  // Allow Ctrl+A, Ctrl+C, Ctrl+X (or Cmd+A, Cmd+C, Cmd+X on Mac)
  if ((ctrlKey || metaKey) && ['a', 'c', 'x'].includes(key.toLowerCase())) {
    return;
  }
  // Allow numeric keys, Backspace, Delete, and navigation keys
  if (
    !/^0$|^[1-9]\d*$|^$/.test(key) &&
    // !/[0-9]/.test(key) &&
    key !== 'Backspace' &&
    key !== 'Delete' &&
    key !== 'ArrowLeft' &&
    key !== 'ArrowRight' &&
    key !== 'Tab'
  ) {
    event.preventDefault(); // Block other keys
  }
};

export const getFormattedDate = (date, monthFormat = 'short') => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: monthFormat, // '2-digit', 'long'
    day: '2-digit'
  });
}