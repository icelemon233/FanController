import { Button, Tooltip } from 'antd';
import { CircleHelp, LayoutGrid, Pin, PinOff, Settings, SlidersHorizontal } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createSidebarState } from '../components/sidebarState.ts';
import shell from '../design/window-shell.json' with { type: 'json' };
import { isKeyboardNavigation } from '../platform/inputModality.ts';

export type AppPage = 'home' | 'devices' | 'settings';

export function useNavigation(pinned: boolean, narrow: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const [navigation] = useState(() =>
    createSidebarState(pinned, narrow, shell.sidebar.hoverHideDelayMs),
  );
  const state = useSyncExternalStore(navigation.subscribe, navigation.getSnapshot);
  useEffect(() => navigation.setPinned(pinned), [navigation, pinned]);
  useEffect(() => navigation.setNarrow(narrow), [navigation, narrow]);
  useEffect(() => () => navigation.dispose(), [navigation]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const keyboard = () => {
      navigation.hold(
        'keyboard',
        document.documentElement.dataset.inputModality === 'keyboard' &&
          Boolean(element.querySelector(':focus-visible')),
      );
    };
    const pointer = () => navigation.hold('keyboard', false);
    const key = (event: KeyboardEvent) => {
      if (isKeyboardNavigation(event)) requestAnimationFrame(keyboard);
    };
    const menu = () =>
      navigation.hold(
        'menu',
        Boolean(element.querySelector('[aria-haspopup="menu"][aria-expanded="true"]')),
      );
    const endDrag = () => navigation.hold('drag', false);
    const enter = () => navigation.hold('pointer', true);
    const leave = () => navigation.hold('pointer', false);
    const drag = () => navigation.hold('drag', true);
    const observer = new MutationObserver(menu);
    observer.observe(element, {
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-expanded'],
    });
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', pointer, true);
    element.addEventListener('focusin', keyboard);
    element.addEventListener('focusout', keyboard);
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('dragstart', drag);
    window.addEventListener('dragend', endDrag);
    window.addEventListener('drop', endDrag);
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', pointer, true);
      element.removeEventListener('focusin', keyboard);
      element.removeEventListener('focusout', keyboard);
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('dragstart', drag);
      window.removeEventListener('dragend', endDrag);
      window.removeEventListener('drop', endDrag);
    };
  }, [navigation]);
  return { state, root };
}

export function AppNavigation({
  page,
  expanded,
  pinned,
  drawer = false,
  onPage,
  onHelp,
  onPin,
}: {
  page: AppPage;
  expanded: boolean;
  pinned: boolean;
  drawer?: boolean;
  onPage: (page: AppPage) => void;
  onHelp: () => void;
  onPin: () => void;
}) {
  const item = (
    label: string,
    icon: ReactNode,
    action: () => void,
    key?: AppPage,
    test?: string,
  ) => (
    <Tooltip title={!expanded ? label : undefined} placement="right">
      <Button
        type="text"
        className="navigation-item"
        aria-label={label}
        aria-current={key === page ? 'page' : undefined}
        onClick={action}
      >
        <span className="navigation-icon">{icon}</span>
        <span className="navigation-label" data-testid={test}>
          {label}
        </span>
      </Button>
    </Tooltip>
  );
  return (
    <>
      <nav className="navigation-list" aria-label="主导航">
        {item(
          '散热概览',
          <LayoutGrid aria-hidden="true" />,
          () => onPage('home'),
          'home',
          'home-menu',
        )}
        {item(
          '风扇设置',
          <SlidersHorizontal aria-hidden="true" />,
          () => onPage('devices'),
          'devices',
          'advanced-menu',
        )}
      </nav>
      <div className="navigation-bottom">
        <div className="navigation-help">
          {item('使用帮助', <CircleHelp aria-hidden="true" />, onHelp)}
        </div>
        <div className="sidebar-footer">
          {item(
            '设置',
            <Settings aria-hidden="true" />,
            () => onPage('settings'),
            'settings',
            'app-settings',
          )}
          {expanded && !drawer && (
            <Tooltip title={pinned ? '取消固定侧栏' : '固定侧栏'} placement="top">
              <Button
                type="text"
                className="sidebar-pin"
                aria-label={pinned ? '取消固定侧栏' : '固定侧栏'}
                aria-pressed={pinned}
                data-testid="sidebar-pin"
                onClick={onPin}
                icon={pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
              />
            </Tooltip>
          )}
        </div>
      </div>
    </>
  );
}
