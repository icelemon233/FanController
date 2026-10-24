import {
  AppstoreOutlined,
  CloseOutlined,
  CompressOutlined,
  ExpandOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MinusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  SlidersOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Empty,
  Layout,
  Menu,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { lazy, type PointerEvent, Suspense, useEffect, useState } from 'react';
import appIcon from '../assets/app-icon.png';
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
import AppSettings from './AppSettings.tsx';
import type { WindowControls } from './runtime.ts';

const FanOverview = lazy(() => import('../features/fans/FanOverview.tsx'));
const FanDevices = lazy(() => import('../features/fans/FanDevices.tsx'));
const SetupDrawer = lazy(() => import('../features/fans/SetupDrawer.tsx'));
const HelpDrawer = lazy(() => import('../features/fans/HelpDrawer.tsx'));
const { Text, Title } = Typography;
type Page = 'home' | 'devices' | 'settings';
const pageNames: Record<Page, string> = {
  home: '温度与风扇',
  devices: '风扇设置',
  settings: '设置',
};
const interactive =
  'button,a,input,select,textarea,[role="button"],[role="menuitem"],[contenteditable]';

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
  const [page, setPage] = useState<Page>('home');
  const [setup, setSetup] = useState(false);
  const [help, setHelp] = useState(false);
  const [initialClose] = useState(() => closePreference.read());
  const [initialNavigation] = useState(() => navigationPreference.read());
  const [closeBehavior, setCloseBehavior] = useState(initialClose.value);
  const [navigation, setNavigation] = useState(initialNavigation.value);
  const [collapsed, setCollapsed] = useState(
    () =>
      initialNavigation.value === 'collapsed' || window.matchMedia('(max-width: 1000px)').matches,
  );
  const [maximized, setMaximized] = useState(false);
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
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1000px)');
    const update = () => setCollapsed(media.matches || navigation === 'collapsed');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [navigation]);
  const saveIssue = (issue: string | undefined) => {
    if (issue) void message.warning(issue);
  };
  const toggleNavigation = () => {
    const next = collapsed ? 'expanded' : 'collapsed';
    setCollapsed(!collapsed);
    setNavigation(next);
    saveIssue(navigationPreference.write(next));
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
          <Text strong className="brand-name">
            FanController
          </Text>
        </div>
        <div className="header-actions">
          {frame?.Demo && (
            <Tooltip title="使用模拟读数，操作只影响演示风扇">
              <Tag color="warning">演示模式</Tag>
            </Tooltip>
          )}
          <Badge
            className="connection-status"
            status={
              connected ? 'success' : state.connection.kind === 'failed' ? 'error' : 'processing'
            }
            text={
              <Text type="secondary">
                {connected
                  ? '每秒更新'
                  : state.connection.kind === 'connecting'
                    ? '正在检测'
                    : state.connection.kind === 'reconnecting'
                      ? '正在重新连接'
                      : '读数已暂停'}
              </Text>
            }
          />
          {windows.desktop && (
            <Space size={0} className="window-actions">
              <Button
                type="text"
                aria-label="最小化"
                title="最小化到任务栏"
                icon={<MinusOutlined aria-hidden="true" />}
                onClick={() => windows.act('minimize')}
              />
              <Button
                type="text"
                aria-label={maximized ? '还原窗口' : '最大化窗口'}
                title={maximized ? '还原窗口' : '最大化窗口'}
                data-testid="window-maximize"
                icon={
                  maximized ? (
                    <CompressOutlined aria-hidden="true" />
                  ) : (
                    <ExpandOutlined aria-hidden="true" />
                  )
                }
                onClick={() => windows.act('maximize')}
              />
              <Button
                type="text"
                aria-label="关闭窗口"
                title={closeBehavior === 'tray' ? '关闭到托盘，继续调节风扇' : '恢复原设置并退出'}
                className="window-close"
                icon={<CloseOutlined aria-hidden="true" />}
                onClick={() => windows.act('close')}
              />
            </Space>
          )}
        </div>
      </Layout.Header>
      <Layout className="app-body">
        <Layout.Sider
          className="app-sidebar"
          width={224}
          collapsedWidth={56}
          collapsed={collapsed}
          trigger={null}
          theme={mode}
        >
          <div className="sidebar-toggle">
            <Tooltip title={collapsed ? '展开导航' : '折叠导航'} placement="right">
              <Button
                type="text"
                aria-label={collapsed ? '展开导航' : '折叠导航'}
                aria-expanded={!collapsed}
                icon={
                  collapsed ? (
                    <MenuUnfoldOutlined aria-hidden="true" />
                  ) : (
                    <MenuFoldOutlined aria-hidden="true" />
                  )
                }
                onClick={toggleNavigation}
              />
            </Tooltip>
          </div>
          <Menu
            className="sidebar-menu"
            mode="inline"
            inlineCollapsed={collapsed}
            theme={mode}
            selectedKeys={page === 'settings' ? [] : [page]}
            onClick={({ key }) => {
              if (key === 'home' || key === 'devices') setPage(key);
            }}
            items={[
              {
                key: 'home',
                icon: <AppstoreOutlined aria-hidden="true" />,
                title: '散热概览',
                label: <span data-testid="home-menu">散热概览</span>,
              },
              {
                key: 'devices',
                icon: <SlidersOutlined aria-hidden="true" />,
                title: '风扇设置',
                label: <span data-testid="advanced-menu">风扇设置</span>,
              },
            ]}
          />
          <div className="sidebar-bottom">
            <Menu
              className="sidebar-menu"
              mode="inline"
              inlineCollapsed={collapsed}
              theme={mode}
              selectedKeys={page === 'settings' ? ['settings'] : []}
              onClick={({ key }) => (key === 'settings' ? setPage('settings') : setHelp(true))}
              items={[
                {
                  key: 'help',
                  icon: <QuestionCircleOutlined aria-hidden="true" />,
                  title: '使用帮助',
                  label: '使用帮助',
                },
                {
                  key: 'settings',
                  icon: <SettingOutlined aria-hidden="true" />,
                  title: '设置',
                  label: <span data-testid="app-settings">设置</span>,
                },
              ]}
            />
          </div>
        </Layout.Sider>
        <Layout.Content className="main-scroll">
          <main className="main-content">
            <div className="page-heading">
              <Title level={3}>{pageNames[page]}</Title>
              {page === 'devices' && (
                <Button
                  icon={<ReloadOutlined aria-hidden="true" />}
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
        </Layout.Content>
      </Layout>
      <Suspense fallback={null}>
        {setup && <SetupDrawer open onClose={() => setSetup(false)} />}
        {help && <HelpDrawer open onClose={() => setHelp(false)} />}
      </Suspense>
    </Layout>
  );
}
