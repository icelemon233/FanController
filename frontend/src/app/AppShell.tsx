import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Layout,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { PanelLeft, RotateCw } from 'lucide-react';
import { lazy, type PointerEvent, Suspense, useEffect, useRef, useState } from 'react';
import appIcon from '../assets/app-icon.png';
import { WindowGlyph } from '../components/WindowGlyph.tsx';
import shell from '../design/window-shell.json' with { type: 'json' };
import { ConnectionNotice } from '../features/fans/ConnectionNotice.tsx';
import { useFanControl } from '../features/fans/FanControlProvider.tsx';
import { channelName, summarizeFans } from '../features/fans/model.ts';
import type {
  CloseBehavior,
  NavigationPreference,
  ThemeMode,
  ThemePreference,
} from '../platform/appearance.ts';
import type { ChoicePreference } from '../platform/preferences.ts';
import type { CaptionHover } from '../platform/webview.ts';
import { AppNavigation, type AppPage, useNavigation } from './AppNavigation.tsx';
import AppSettings from './AppSettings.tsx';
import type { WindowControls } from './runtime.ts';

const FanOverview = lazy(() => import('../features/fans/FanOverview.tsx'));
const FanDevices = lazy(() => import('../features/fans/FanDevices.tsx'));
const SetupDrawer = lazy(() => import('../features/fans/SetupDrawer.tsx'));
const HelpDrawer = lazy(() => import('../features/fans/HelpDrawer.tsx'));
const { Text, Title } = Typography;
const pageNames: Record<AppPage, string> = {
  home: '温度与风扇',
  devices: '风扇设置',
  settings: '设置',
};
const interactive =
  'button,a,input,select,textarea,[role="button"],[role="menuitem"],[contenteditable]';

function initialPage(): AppPage {
  const qa: unknown = Reflect.get(window, '__fanControllerUiQa');
  const page: unknown = qa && typeof qa === 'object' ? Reflect.get(qa, 'page') : undefined;
  return page === 'devices' || page === 'settings' ? page : 'home';
}

export default function AppShell({
  mode,
  themePreference,
  onTheme,
  windows,
  closePreference,
  navigationPreference,
}: {
  mode: ThemeMode;
  themePreference: ThemePreference;
  onTheme: (value: ThemePreference) => void;
  windows: WindowControls;
  closePreference: ChoicePreference<CloseBehavior>;
  navigationPreference: ChoicePreference<NavigationPreference>;
}) {
  const { state, controller } = useFanControl();
  const { message } = App.useApp();
  const [page, setPage] = useState<AppPage>(initialPage);
  const [setup, setSetup] = useState(false);
  const [help, setHelp] = useState(false);
  const [initialClose] = useState(() => closePreference.read());
  const [initialNavigation] = useState(() => navigationPreference.read());
  const [closeBehavior, setCloseBehavior] = useState(initialClose.value);
  // The established expanded/collapsed preference now means pinned/unpinned.
  // Hover, focus and drawer state are never written to storage.
  const [pinned, setPinned] = useState(initialNavigation.value === 'expanded');
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 699px)').matches);
  const [drawer, setDrawer] = useState(false);
  const drawerTrigger = useRef<HTMLButtonElement>(null);
  const { state: navigation, root: sidebarRoot } = useNavigation(pinned, narrow);
  const [maximized, setMaximized] = useState(false);
  const [captionHover, setCaptionHover] = useState<CaptionHover>('none');
  const snapshot = state.snapshot;
  const frame = snapshot?.Snapshot;
  const summary = snapshot ? summarizeFans(snapshot) : undefined;
  const connected = state.connection.kind === 'ready';
  useEffect(() => {
    for (const issue of [initialClose.issue, initialNavigation.issue]) {
      if (issue) void message.warning(issue);
    }
  }, [initialClose, initialNavigation, message]);
  useEffect(() => windows.setCloseBehavior(closeBehavior), [closeBehavior, windows]);
  useEffect(() => windows.subscribeWindowState(setMaximized), [windows]);
  useEffect(() => windows.subscribeCaptionHover(setCaptionHover), [windows]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 699px)');
    const update = () => {
      setNarrow(media.matches);
      if (!media.matches) setDrawer(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const saveIssue = (issue: string | undefined) => {
    if (issue) void message.warning(issue);
  };
  const togglePin = () => {
    setPinned(!pinned);
    saveIssue(navigationPreference.write(pinned ? 'collapsed' : 'expanded'));
  };
  const choosePage = (next: AppPage) => {
    setPage(next);
    setDrawer(false);
  };
  const chooseCloseBehavior = (next: CloseBehavior) => {
    setCloseBehavior(next);
    saveIssue(closePreference.write(next));
  };
  const dragWindow = (event: PointerEvent<HTMLElement>) => {
    if (!windows.desktop || event.button !== 0 || !event.isPrimary) return;
    const target = event.target;
    if (
      !(target instanceof Element) ||
      !target.closest('[data-window-drag]') ||
      target.closest(interactive)
    )
      return;
    event.preventDefault();
    windows.act('drag');
  };
  const loading = (
    <div className="page-loading" role="status" aria-label="正在读取设备状态" aria-busy="true">
      <div aria-hidden="true">
        {page === 'home' && (
          <div className="overview-board skeleton-readings">
            <Card>
              <Skeleton active paragraph={{ rows: 2 }} />
            </Card>
            <Card>
              <Skeleton active paragraph={{ rows: 2 }} />
            </Card>
          </div>
        )}
        <Card>
          <Skeleton active paragraph={{ rows: page === 'home' ? 4 : 6 }} />
        </Card>
      </div>
    </div>
  );
  return (
    <Layout className="app-layout" data-ui data-theme={mode} onPointerDown={dragWindow}>
      <Layout.Header className="app-header" data-window-drag>
        <div className="brand">
          <img
            className="brand-image"
            data-testid="app-brand-icon"
            src={appIcon}
            alt=""
            draggable={false}
            width={24}
            height={24}
          />
          <Text className="brand-name">FanController</Text>
        </div>
        <div className="header-actions">
          {windows.desktop && (
            <Space size={0} className="window-actions">
              <Button
                type="text"
                aria-label="最小化"
                className={captionHover === 'minimize' ? 'caption-native-hover' : undefined}
                title="最小化到任务栏"
                icon={<WindowGlyph kind="minimize" />}
                onClick={() => windows.act('minimize')}
              />
              <Button
                type="text"
                aria-label={maximized ? '还原窗口' : '最大化窗口'}
                title={maximized ? '还原窗口' : '最大化窗口'}
                data-testid="window-maximize"
                className={captionHover === 'maximize' ? 'caption-native-hover' : undefined}
                icon={<WindowGlyph kind={maximized ? 'restore' : 'maximize'} />}
                onClick={() => windows.act('maximize')}
              />
              <Button
                type="text"
                aria-label="关闭窗口"
                title={closeBehavior === 'tray' ? '关闭到托盘，继续调节风扇' : '恢复原设置并退出'}
                className={
                  captionHover === 'close' ? 'window-close caption-native-hover' : 'window-close'
                }
                icon={<WindowGlyph kind="close" />}
                onClick={() => windows.act('close')}
              />
            </Space>
          )}
        </div>
      </Layout.Header>
      <Layout className="app-body">
        <Layout.Sider
          className="sidebar-rail"
          width={pinned && !narrow ? shell.sidebar.expandedWidth : shell.sidebar.collapsedWidth}
          trigger={null}
          theme={mode}
          aria-label="导航"
        >
          <div
            ref={sidebarRoot}
            className="app-sidebar"
            data-expanded={navigation.expanded}
            data-pinned={pinned}
            data-floating={!pinned && navigation.expanded}
          >
            <AppNavigation
              page={page}
              expanded={navigation.expanded}
              pinned={pinned}
              onPage={choosePage}
              onHelp={() => setHelp(true)}
              onPin={togglePin}
            />
          </div>
        </Layout.Sider>
        <Layout.Content className="main-area">
          <div className="content-toolbar">
            <div className="toolbar-leading">
              {narrow && (
                <Button
                  ref={drawerTrigger}
                  type="text"
                  className="navigation-drawer-trigger"
                  aria-label="展开导航"
                  aria-expanded={drawer}
                  icon={<PanelLeft aria-hidden="true" />}
                  onClick={() => setDrawer(true)}
                />
              )}
              <Title level={2}>{pageNames[page]}</Title>
            </div>
            <div className="toolbar-actions">
              {frame?.Demo && (
                <Tooltip title="使用模拟读数，操作只影响演示风扇">
                  <Tag color="warning">演示模式</Tag>
                </Tooltip>
              )}
              <span className="connection-status" data-status={state.connection.kind}>
                <span className="status-dot" aria-hidden="true" />
                <span className="connection-label">
                  {connected
                    ? '每秒更新'
                    : state.connection.kind === 'connecting'
                      ? '正在检测'
                      : state.connection.kind === 'reconnecting'
                        ? '正在重新连接'
                        : '读数已暂停'}
                </span>
              </span>
              {page === 'devices' && (
                <Button
                  icon={<RotateCw aria-hidden="true" />}
                  loading={state.busy === 'rescan'}
                  disabled={Boolean(state.busy) || !connected}
                  onClick={() => {
                    void controller.rescan();
                  }}
                >
                  重新检测
                </Button>
              )}
            </div>
          </div>
          <div className="main-scroll">
            <main className="main-content">
              <ConnectionNotice />
              {page === 'settings' ? (
                <AppSettings
                  themePreference={themePreference}
                  onTheme={onTheme}
                  closeBehavior={closeBehavior}
                  onCloseBehavior={chooseCloseBehavior}
                  windows={windows}
                  busy={Boolean(state.busy)}
                  onHelp={() => setHelp(true)}
                />
              ) : (
                <>
                  {!snapshot &&
                    (state.connection.kind === 'connecting' ? (
                      loading
                    ) : (
                      <Card>
                        <Empty description="尚未读取到设备状态" />
                      </Card>
                    ))}
                  {summary?.needsSetup && (
                    <Alert
                      className="setup-alert"
                      type="info"
                      showIcon
                      title="启用主板访问，检测受支持的 CPU 和机箱风扇"
                      action={
                        <Button
                          disabled={!connected || Boolean(state.busy)}
                          onClick={() => setSetup(true)}
                        >
                          启用主板访问
                        </Button>
                      }
                    />
                  )}
                  {snapshot && summary && summary.abnormal.length > 0 && (
                    <Alert
                      type="warning"
                      showIcon
                      title="风扇保护与故障"
                      description={summary.abnormal
                        .map(
                          (channel) =>
                            `${channelName(channel, snapshot)}：${channel.Error ?? channel.Status}`,
                        )
                        .join('；')}
                      action={<Button onClick={() => setPage('devices')}>查看详情</Button>}
                    />
                  )}
                  <Suspense fallback={loading}>
                    {snapshot &&
                      (page === 'home' ? (
                        <FanOverview onDevices={() => setPage('devices')} />
                      ) : (
                        <FanDevices />
                      ))}
                  </Suspense>
                </>
              )}
            </main>
          </div>
        </Layout.Content>
        {narrow && (
          <Drawer
            rootClassName="navigation-drawer"
            placement="left"
            size={shell.sidebar.expandedWidth}
            open={drawer}
            onClose={() => setDrawer(false)}
            afterOpenChange={(open) => {
              if (!open) drawerTrigger.current?.focus();
            }}
            getContainer={false}
            closeIcon={null}
            destroyOnHidden
          >
            <AppNavigation
              drawer
              page={page}
              expanded
              pinned={pinned}
              onPage={choosePage}
              onHelp={() => {
                setDrawer(false);
                setHelp(true);
              }}
              onPin={togglePin}
            />
          </Drawer>
        )}
      </Layout>
      <Suspense fallback={null}>
        {setup && <SetupDrawer open onClose={() => setSetup(false)} />}
        {help && <HelpDrawer open onClose={() => setHelp(false)} />}
      </Suspense>
    </Layout>
  );
}
