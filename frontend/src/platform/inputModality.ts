type KeyInput = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'>;

export function isKeyboardNavigation(event: KeyInput) {
  return (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    [
      'Tab',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'Enter',
      ' ',
      'Escape',
    ].includes(event.key)
  );
}

export function trackInputModality(document: Document) {
  const root = document.documentElement;
  const previous = root.dataset.inputModality;
  root.dataset.inputModality = 'pointer';
  const pointer = () => {
    root.dataset.inputModality = 'pointer';
  };
  const keyboard = (event: KeyboardEvent) => {
    if (isKeyboardNavigation(event)) root.dataset.inputModality = 'keyboard';
  };
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('keydown', keyboard, true);
  return () => {
    document.removeEventListener('pointerdown', pointer, true);
    document.removeEventListener('keydown', keyboard, true);
    if (previous) root.dataset.inputModality = previous;
    else delete root.dataset.inputModality;
  };
}
