import { useState, useEffect, useCallback } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { PluginConfig } from '../types'
import { IconTerminal, IconAlert } from '../components/icons'

export default function ConfigPage() {
  const [config, setConfig] = useState<PluginConfig | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchConfig = useCallback(async () => {
    try {
      const res = await noAuthFetch<PluginConfig>('/config')
      if (res.code === 0 && res.data) setConfig(res.data)
    } catch {
      showToast('获取配置失败', 'error')
    }
  }, [])

  useEffect(() => {
    void fetchConfig()
  }, [fetchConfig])

  const saveConfig = useCallback(
    async (update: Partial<PluginConfig>) => {
      if (!config) return
      setSaving(true)
      try {
        const newConfig = { ...config, ...update }
        const res = await noAuthFetch<PluginConfig>('/config', {
          method: 'POST',
          body: JSON.stringify(newConfig),
        })
        if (res.code !== 0) throw new Error(res.message || '保存失败')
        setConfig(res.data || newConfig)
        showToast('配置已保存', 'success')
      } catch {
        showToast('保存失败', 'error')
      } finally {
        setSaving(false)
      }
    },
    [config]
  )

  const updateField = <K extends keyof PluginConfig>(key: K, value: PluginConfig[K]) => {
    if (!config) return
    setConfig({ ...config, [key]: value })
    void saveConfig({ [key]: value })
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-64 empty-state">
        <div className="flex flex-col items-center gap-3">
          <div className="loading-spinner text-primary" />
          <div className="text-gray-400 text-sm">加载配置中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 stagger-children">
      <div className="card p-4 flex gap-3 items-start bg-amber-50/80 dark:bg-amber-500/10 border-amber-200/60 dark:border-amber-500/20">
        <IconAlert size={18} className="text-amber-500 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-800 dark:text-amber-200/90 leading-relaxed">
          批量删除好友 / 退群属于危险操作，建议保持「二次确认」开启，并设置合理的操作间隔。修改会立即保存到插件配置文件。
        </div>
      </div>

      <div className="card p-5 hover-lift">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
          <IconTerminal size={16} className="text-gray-400" />
          基础与安全
        </h3>
        <div className="space-y-5">
          <ToggleRow label="启用插件" desc="关闭后拒绝所有写操作（列表仍可读取）" checked={config.enabled} onChange={(v) => updateField('enabled', v)} />
          <ToggleRow label="调试模式" desc="输出详细操作日志" checked={config.debug} onChange={(v) => updateField('debug', v)} />
          <ToggleRow label="允许批量删除好友" desc="关闭后删除接口将直接拒绝" checked={config.allowBatchDeleteFriend} onChange={(v) => updateField('allowBatchDeleteFriend', v)} />
          <ToggleRow label="允许批量退群" desc="关闭后退群接口将直接拒绝" checked={config.allowBatchLeaveGroup} onChange={(v) => updateField('allowBatchLeaveGroup', v)} />
          <ToggleRow label="允许批量移动分组" desc="依赖 NT BuddyService，部分环境可能不可用" checked={config.allowBatchMoveCategory} onChange={(v) => updateField('allowBatchMoveCategory', v)} />
          <ToggleRow label="前端二次确认" desc="危险操作前弹出确认框" checked={config.requireConfirm} onChange={(v) => updateField('requireConfirm', v)} />
          <InputRow
            label="批量操作间隔 (ms)"
            desc="建议 200–500，降低限流风险"
            value={String(config.operationDelayMs)}
            type="number"
            onChange={(v) => updateField('operationDelayMs', Math.max(0, Number(v) || 0))}
          />
        </div>
      </div>

      <div className="card p-5 hover-lift">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
          删除好友默认选项
        </h3>
        <div className="space-y-5">
          <ToggleRow label="删除时拉黑" desc="对应 delete_friend.temp_block" checked={config.deleteFriendBlock} onChange={(v) => updateField('deleteFriendBlock', v)} />
          <ToggleRow label="双向删除" desc="对应 delete_friend.temp_both_del" checked={config.deleteFriendBothDel} onChange={(v) => updateField('deleteFriendBothDel', v)} />
        </div>
      </div>

      {saving && (
        <div className="saving-indicator fixed bottom-4 right-4 bg-indigo-500 text-white text-xs px-3 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <div className="loading-spinner !w-3 !h-3 !border-[1.5px]" />
          保存中...
        </div>
      )}
    </div>
  )
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  )
}

function InputRow({
  label,
  desc,
  value,
  type = 'text',
  onChange,
}: {
  label: string
  desc: string
  value: string
  type?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
      </div>
      <input
        type={type}
        className="w-full sm:w-40 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e20] px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
