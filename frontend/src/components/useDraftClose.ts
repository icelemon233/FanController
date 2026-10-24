import { App } from 'antd';
import { useEffect, useRef } from 'react';

export function useDraftClose(value: unknown, busy: boolean, onClose: () => void) {
  const { modal } = App.useApp();
  const initial = useRef(JSON.stringify(value));
  const confirming = useRef(false);
  const exitApproved = useRef(false);
  const close = (exiting = false) => {
    if (busy || confirming.current) return;
    if (JSON.stringify(value) === initial.current) {
      onClose();
      return;
    }
    confirming.current = true;
    modal.confirm({
      title: '放弃未应用的修改？',
      content: '风扇仍使用当前设置。放弃后，本次编辑的参数不会保存。',
      okText: '放弃修改',
      cancelText: '继续编辑',
      focusable: { autoFocusButton: 'cancel' },
      onOk: () => {
        if (exiting) exitApproved.current = true;
        onClose();
        if (exiting) window.dispatchEvent(new Event('fancontroller-exit-approved'));
      },
      afterClose: () => {
        confirming.current = false;
      },
    });
  };
  useEffect(() => {
    const guard = (event: Event) => {
      if (exitApproved.current) return;
      if (busy || JSON.stringify(value) !== initial.current) {
        event.preventDefault();
        close(true);
      }
    };
    window.addEventListener('fancontroller-before-exit', guard);
    return () => window.removeEventListener('fancontroller-before-exit', guard);
  });
  return () => close();
}
