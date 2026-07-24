import { useState, useEffect } from 'react'
import type { PluginStatus } from '../types'
import { IconPower, IconClock, IconActivity, IconRefresh, IconUser, IconGroup, IconFolder } from '../components/icons'

interface StatusPageProps {
  status: PluginStatus | null
  onRefresh: () => void
}

function formatUptime(uptimeMs: number): string {
  const seconds = Math.floor(uptimeMs / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (days > 0) return `${days}天 ${hours}小时 ${minutes}分`
  if (hours > 0) return `${hours}小时 ${minutes}分 ${secs}秒`
  if (minutes > 0) return `${minutes}分 ${secs}秒`
  return `${secs}秒`
}

export default function StatusPage({ status, onRefresh }: StatusPageProps) {
  const [displayUptime, setDisplayUptime] = useState('-')
  const [syncInfo, setSyncInfo] = useState<{ baseUptime: number; syncTime: number } | null>(null)

  useEffect(() => {
    if (status?.uptime !== undefined && status.uptime > 0) {
      setSyncInfo({ baseUptime: status.uptime, syncTime: Date.now() })
    }
  }, [status?.uptime])

  useEffect(() => {
    if (!syncInfo) {
      setDisplayUptime('-')
      return
    }
    const tick = () => setDisplayUptime(formatUptime(syncInfo.baseUptime + (Date.now() - syncInfo.syncTime)))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [syncInfo])

  if (!status) {
    return (
      <div className="flex items-center justify-center h-64 empty-state">
        <div className="flex flex-col items-center gap-3">
          <div className="loading-spinner text-primary" />
          <div className="text-gray-400 text-sm">正在获取插件状态...</div>
        </div>
      </div>
    )
  }

  const { config, stats } = status
  const cards = [
    {
      label: '插件状态',
      value: config.enabled ? '运行中' : '已停用',
      icon: <IconPower size={18} />,
      color: config.enabled ? 'text-emerald-500' : 'text-red-400',
      bg: config.enabled ? 'bg-emerald-500/10' : 'bg-red-500/10',
    },
    {
      label: '运行时长',
      value: displayUptime,
      icon: <IconClock size={18} />,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10',
    },
    {
      label: '今日操作',
      value: String(stats.todayProcessed ?? 0),
      icon: <IconActivity size={18} />,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      label: '累计操作',
      value: String(stats.processed ?? 0),
      icon: <IconActivity size={18} />,
      color: 'text-sky-500',
      bg: 'bg-sky-500/10',
    },
  ]

  const opCards = [
    { label: '删除好友', value: stats.friendsDeleted ?? 0, icon: <IconUser size={16} /> },
    { label: '退出群聊', value: stats.groupsLeft ?? 0, icon: <IconGroup size={16} /> },
    { label: '移动分组', value: stats.categoriesMoved ?? 0, icon: <IconFolder size={16} /> },
    { label: '修改备注', value: stats.remarksSet ?? 0, icon: <IconActivity size={16} /> },
  ]

  return (
    <div className="space-y-6 stagger-children">
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-gray-400 mb-1">当前账号</div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {status.selfNickname || '未知'}{' '}
            <span className="text-sm font-mono text-gray-500">({status.selfId || '-'})</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">插件 ID: {status.pluginName}</div>
        </div>
        <button type="button" className="btn-secondary" onClick={onRefresh}>
          <IconRefresh size={14} /> 刷新
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.bg} ${c.color}`}>{c.icon}</div>
              <span className="text-xs text-gray-400">{c.label}</span>
            </div>
            <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-4 text-gray-900 dark:text-white">操作统计</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {opCards.map((c) => (
            <div key={c.label} className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
                {c.icon}
                {c.label}
              </div>
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">安全开关快照</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <Row label="批量删好友" on={config.allowBatchDeleteFriend} />
          <Row label="批量退群" on={config.allowBatchLeaveGroup} />
          <Row label="批量移动分组" on={config.allowBatchMoveCategory} />
          <Row label="前端二次确认" on={config.requireConfirm} />
          <div className="text-gray-500 col-span-full text-xs mt-1">
            操作间隔: {config.operationDelayMs} ms · 删好友拉黑: {config.deleteFriendBlock ? '是' : '否'} ·
            双向删除: {config.deleteFriendBothDel ? '是' : '否'}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/40">
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span className={on ? 'text-emerald-500 text-xs font-medium' : 'text-red-400 text-xs font-medium'}>
        {on ? '开启' : '关闭'}
      </span>
    </div>
  )
}
