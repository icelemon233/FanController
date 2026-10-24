import { type GetRef, InputNumber, type InputNumberProps } from 'antd';
import { useLayoutEffect, useRef } from 'react';

// The pinned rc input-number exposes no locale for its step buttons.
// Keep Ant Design's value, keyboard and disabled behavior; translate only their names.
export function NumberInput(props: InputNumberProps<number>) {
  const input = useRef<GetRef<typeof InputNumber>>(null);
  useLayoutEffect(() => {
    const root = input.current?.nativeElement;
    root?.querySelector('[aria-label="Increase Value"]')?.setAttribute('aria-label', '增加数值');
    root?.querySelector('[aria-label="Decrease Value"]')?.setAttribute('aria-label', '减少数值');
  });
  return <InputNumber<number> ref={input} {...props} />;
}
