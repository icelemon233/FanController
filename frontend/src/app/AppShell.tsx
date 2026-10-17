import {
  AppstoreOutlined,
  CloseOutlined,
  ExpandOutlined,
  MinusOutlined,
  MoonOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SunOutlined,
} from '@ant-design/icons';
import {
  Alert,
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
import { lazy, Suspense, useState } from 'react';
import version from '../../../version.json';
import { FanIcon } from '../components/FanIcon.tsx';
import { ConnectionNotice } from '../features/fans/ConnectionNotice.tsx';
import { useFanControl } from '../features/fans/FanControlProvider.tsx';
import { channelName, summarizeFans } from '../features/fans/model.ts';
import type { ThemeMode, WindowControls } from './runtime.ts';

const FanOverview = lazy(() => import('../features/fans/FanOverview.tsx'));
const FanDevices = lazy(() => import('../features/fans/FanDevices.tsx'));
const SetupDrawer = lazy(() => import('../features/fans/SetupDrawer.tsx'));
const HelpDrawer = lazy(() => import('../features/fans/HelpDrawer.tsx'));
const { Text, Title } = Typography;

export default function AppShell({
  mode,
  onTheme,
  windows,
}: {
  mode: ThemeMode;
  onTheme: () => void;
  windows: WindowControls;
}) {
  const { state, controller } = useFanControl();
  const [page, setPage] = useState<'home' | 'devices'>('home');
  const [setup, setSetup] = useState(false);
  const [help, setHelp] = useState(false);
  const snapshot = state.snapshot;
  const frame = snapshot?.Snapshot;
  const summary = snapshot ? summarizeFans(snapshot) : undefined;
  const connected = state.connection.kind === 'ready';
  const dark = mode === 'dark';
  const openDevices = () => setPage('devices');
  return (
    <Layout className="app-layout" data-ui data-theme={mode}>
      <Layout.Sider
        className="app-sidebar"
        width={208}
        breakpoint="lg"
        collapsedWidth={72}
        trigger={null}
        theme={mode}
      >
        <div className="brand">
          <div className="brand-icon">
            <FanIcon style={{ fontSize: 28 }} />
          </div>
          <div>
            <Text strong className="brand-name">
              cinna-fanCon
            </Text>
            <Text type="secondary" className="brand-caption">
              Windows 风扇控制
            </Text>
          </div>
        </div>
        <Menu
          theme={mode}
          selectedKeys={[page]}
          onClick={({ key }) => {
            if (key === 'home' || key === 'devices') setPage(key);
          }}
          items={[
            {
              key: 'home',
              icon: <AppstoreOutlined />,
              label: <span data-testid="home-menu">散热概览</span>,
            },
            {
              key: 'devices',
              icon: <SettingOutlined />,
              label: <span data-testid="advanced-menu">风扇设置</span>,
            },
          ]}
          style={{ background: 'transparent', borderInlineEnd: 0, padding: '0 12px' }}
        />
        <div className="sidebar-bottom">
          <Space orientation="vertical" size={12}>
            <Space className="local-label">
              <SafetyCertificateOutlined />
              <Text>本地运行</Text>
            </Space>
            <Text className="version-label">{version.version} 预览版</Text>
            <Button
              type="text"
              aria-label="使用帮助"
              icon={<QuestionCircleOutlined />}
              onClick={() => setHelp(true)}
            >
              使用帮助
            </Button>
          </Space>
        </div>
      </Layout.Sider>
      <Layout style={{ minWidth: 0, background: 'var(--fd-layout)' }}>
        <Layout.Header
          className="app-header"
          onPointerDown={(event) => {
            if (
              windows.desktop &&
              event.target instanceof Element &&
              !event.target.closest('button,a,input')
            )
              windows.act('drag');
          }}
        >
          <Space size={10}>
            <Text type="secondary">cinna-fanCon</Text>
            <Text strong>{page === 'home' ? '散热概览' : '风扇设置'}</Text>
          </Space>
          <Space size={12}>
            {frame?.Demo && (
              <Tooltip title="使用模拟读数，操作只影响演示风扇">
                <Tag color="gold">演示模式</Tag>
              </Tooltip>
            )}
            <Badge
              status={
                connected ? 'success' : state.connection.kind === 'failed' ? 'error' : 'processing'
              }
              text={
                <Text type="secondary">
                  {connected
                    ? '每秒更新'
                    : state.connection.kind === 'connecting'
                      ? '正在检测'
                      : '读数已暂停'}
                </Text>
              }
            />
            <Tooltip title={dark ? '切换为浅色主题' : '切换为深色主题'}>
              <Button
                type="text"
                aria-label="切换主题"
                icon={dark ? <SunOutlined /> : <MoonOutlined />}
                onClick={onTheme}
              />
            </Tooltip>
            {windows.desktop && (
              <Space size={0} className="window-actions">
                <Button
                  type="text"
                  aria-label="最小化"
                  icon={<MinusOutlined />}
                  onClick={() => windows.act('minimize')}
                />
                <Button
                  type="text"
                  aria-label="最大化或还原"
                  icon={<ExpandOutlined />}
                  onClick={() => windows.act('maximize')}
                />
                <Button
                  type="text"
                  aria-label="关闭应用"
                  className="window-close"
                  icon={<CloseOutlined />}
                  onClick={() => windows.act('close')}
                />
              </Space>
            )}
          </Space>
        </Layout.Header>
        <Layout.Content className="main-scroll">
          <main className="main-content">
            <div className="page-heading">
              <Title level={3}>{page === 'home' ? '温度与风扇' : '单组风扇设置'}</Title>
              {page === 'devices' && (
                <Button
                  icon={<ReloadOutlined />}
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
            {!snapshot &&
              (state.connection.kind === 'connecting' ? (
                <Card>
                  <Skeleton active paragraph={{ rows: 6 }} />
                </Card>
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
                    type="primary"
                    ghost
                    size="small"
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
                action={
                  <Button size="small" onClick={openDevices}>
                    查看详情
                  </Button>
                }
              />
            )}
            <Suspense
              fallback={
                <Card>
                  <Skeleton active paragraph={{ rows: 5 }} />
                </Card>
              }
            >
              {snapshot &&
                (page === 'home' ? <FanOverview onDevices={openDevices} /> : <FanDevices />)}
            </Suspense>
            <footer className="main-footer">
              <Text type="secondary">设置保存在此电脑</Text>
              <Text type="secondary">最小化后在托盘运行，退出前会尝试恢复原设置</Text>
            </footer>
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
