import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { noAuthFetch, postJson } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { BatchItemResult, BatchOpResult, GroupItem, PluginConfig } from '../types'
import { IconSearch, IconRefresh, IconTrash, IconCheck } from '../components/icons'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import { groupAvatarUrl } from '../utils/avatar'
import OperationProgress, { type OperationProgressState } from '../components/OperationProgress'
import ListSkeleton from '../components/ListSkeleton'

interface Props {
  config?: PluginConfig
  onOpDone?: () => void
}

function gid(g: GroupItem): string {
  return String(g.group_id)
}

export default function GroupsPage({ config, onOpDone }: Props) {
  const [groups, setGroups] = useState<GroupItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [remarkDraft, setRemarkDraft] = useState('')
  const [lastResult, setLastResult] = useState<BatchOpResult | null>(null)
  const [statusText, setStatusText] = useState('')
  const [operation, setOperation] = useState<OperationProgressState | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [remarkModal, setRemarkModal] = useState<{ open: boolean; id: string; label: string; value: string }>({
    open: false,
    id: '',
    label: '',
    value: '',
  })
  const pendingIdsRef = useRef<string[]>([])
  const cancelOperationRef = useRef(false)
  const requireConfirm = config?.requireConfirm !== false

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await noAuthFetch<GroupItem[]>('/groups')
      if (res.code === 0 && res.data) setGroups(res.data)
      else showToast(res.message || '获取群列表失败', 'error')
    } catch {
      showToast('获取群列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter(
      (g) =>
        String(g.group_id).includes(q) ||
        (g.group_name || '').toLowerCase().includes(q) ||
        (g.group_remark || '').toLowerCase().includes(q)
    )
  }, [groups, search])

  const toggle = (id: string) => {
    if (busy) return
    if (!id || id === 'undefined') return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((g) => selected.has(gid(g)))
  const someFilteredSelected =
    filtered.length > 0 && filtered.some((g) => selected.has(gid(g)))

  const selectAllFiltered = () => {
    if (busy) return
    if (filtered.length === 0) {
      showToast('当前列表为空', 'warning')
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const g of filtered) next.delete(gid(g))
      } else {
        for (const g of filtered) next.add(gid(g))
      }
      return next
    })
  }

  const requestCancelOperation = () => {
    if (!operation) return
    cancelOperationRef.current = true
    setOperation((s) => (s ? { ...s, cancelRequested: true } : s))
    setStatusText('正在取消，当前请求完成后停止')
  }

  const doLeave = async (ids: string[]) => {
    setBusy(true)
    setLastResult(null)
    cancelOperationRef.current = false
    const baseOperation: OperationProgressState = {
      title: `退群进行中（${ids.length} 个）`,
      total: ids.length,
      done: 0,
      success: 0,
      failed: 0,
      current: ids[0],
      cancelRequested: false,
    }
    setOperation(baseOperation)
    setStatusText(baseOperation.title)

    const results: BatchItemResult[] = []
    let success = 0
    let failed = 0
    let cancelled = false

    try {
      for (let i = 0; i < ids.length; i++) {
        if (cancelOperationRef.current) {
          cancelled = true
          break
        }

        const id = ids[i]
        setOperation((s) => (s ? { ...s, current: id, done: i, success, failed } : s))

        try {
          const res = await postJson<BatchOpResult>('/groups/leave', { group_ids: [id] })
          if (res.code !== 0) throw new Error(res.message || '退群失败')
          if (!res.data) throw new Error('退群接口无返回数据')
          const first = res.data.results?.[0]
          if (res.data.failed > 0 || first?.ok === false) {
            throw new Error(first?.message || '退群失败')
          }
          success += 1
          results.push({ id, ok: true })
        } catch (e) {
          failed += 1
          const message = e instanceof Error ? e.message : String(e)
          results.push({ id, ok: false, message })
        }

        setOperation((s) => (s ? { ...s, done: i + 1, success, failed } : s))
      }

      const result: BatchOpResult = { total: ids.length, success, failed, results }
      setLastResult(result)
      const msg = cancelled
        ? `退群已取消：成功 ${success}，失败 ${failed}，未处理 ${ids.length - success - failed}`
        : `退群：成功 ${success}，失败 ${failed}`
      showToast(msg, cancelled || failed ? 'warning' : 'success')
      setStatusText(msg)
      if (failed > 0) {
        const samples = results
          .filter((r) => !r.ok)
          .slice(0, 3)
          .map((r) => `${r.id}: ${r.message || 'unknown'}`)
          .join('；')
        if (samples) showToast(samples, 'error')
      }
      setSelected(new Set())
      await load()
      onOpDone?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast(msg || '退群失败', 'error')
      setStatusText(`错误: ${msg}`)
      console.error('[contact-manager] leave', e)
    } finally {
      setBusy(false)
      setOperation(null)
      cancelOperationRef.current = false
    }
  }

  const onLeave = () => {
    if (busy) return
    if (config?.allowBatchLeaveGroup === false) {
      showToast('已在配置中禁止批量退群', 'warning')
      return
    }
    if (selected.size === 0) {
      showToast('请先选择群聊', 'warning')
      setStatusText('请先勾选群聊')
      return
    }
    const ids = Array.from(selected).map(String)
    pendingIdsRef.current = ids
    if (!requireConfirm) {
      void doLeave(ids)
      return
    }
    // iframe 内 window.confirm 常被静默拦截，用页内弹窗
    setConfirmOpen(true)
  }

  const onRemarkOne = (groupId: string | number, label: string, current?: string) => {
    if (busy) return
    setRemarkModal({
      open: true,
      id: String(groupId),
      label,
      value: current || remarkDraft || '',
    })
  }

  const submitRemark = async () => {
    const { id, value } = remarkModal
    setRemarkModal((s) => ({ ...s, open: false }))
    if (!id) return
    setBusy(true)
    setStatusText(`设置群备注 ${id}…`)
    try {
      const res = await postJson('/groups/remark', { group_id: id, remark: value })
      if (res.code !== 0) throw new Error(res.message || '设置失败')
      showToast('群备注已更新', 'success')
      setStatusText('群备注已更新')
      await load()
      onOpDone?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast(msg, 'error')
      setStatusText(`错误: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  const onRowLeave = (id: string, label: string) => {
    if (busy) return
    if (config?.allowBatchLeaveGroup === false) {
      showToast('已在配置中禁止退群', 'warning')
      return
    }
    pendingIdsRef.current = [id]
    if (!requireConfirm) {
      void doLeave([id])
      return
    }
    setConfirmOpen(true)
    // message uses pendingIdsRef; store label in status for clarity
    setStatusText(`待确认退群: ${label} (${id})`)
  }

  if (loading) {
    return <ListSkeleton title="加载群聊列表" rows={9} />
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={confirmOpen}
        title={pendingIdsRef.current.length === 1 ? '确认退群' : '确认批量退群'}
        message={
          pendingIdsRef.current.length === 1
            ? `将退出群 ${pendingIdsRef.current[0]}，此操作不可撤销。`
            : `将退出 ${pendingIdsRef.current.length || selected.size} 个群聊，此操作不可撤销。`
        }
        confirmText="确认退群"
        danger
        onConfirm={() => {
          setConfirmOpen(false)
          void doLeave(pendingIdsRef.current)
        }}
        onCancel={() => {
          setConfirmOpen(false)
          setStatusText('已取消')
        }}
      />

      <Modal open={remarkModal.open} onClose={() => setRemarkModal((s) => ({ ...s, open: false }))} maxWidth="sm">
        <div className="p-5">
          <h3 className="text-sm font-semibold mb-1 text-gray-900 dark:text-white">设置群备注</h3>
          <p className="text-xs text-gray-500 mb-3">
            {remarkModal.label}（{remarkModal.id}）
          </p>
          <input
            className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#161618] px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-indigo-400/40"
            value={remarkModal.value}
            onChange={(e) => setRemarkModal((s) => ({ ...s, value: e.target.value }))}
            placeholder="群备注（可留空清空）"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitRemark()
            }}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary text-xs" onClick={() => setRemarkModal((s) => ({ ...s, open: false }))}>
              取消
            </button>
            <button type="button" className="btn-primary text-xs" onClick={() => void submitRemark()}>
              保存
            </button>
          </div>
        </div>
      </Modal>

      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e20] outline-none focus:ring-2 focus:ring-indigo-400/40"
            placeholder="搜索群号 / 群名 / 备注"
            value={search}
            disabled={busy}
            onChange={(e) => setSearch(e.target.value)}
          />
          </div>
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={busy}>
            <IconRefresh size={14} /> 刷新
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" className="btn-secondary text-xs" onClick={selectAllFiltered} disabled={busy}>
            {allFilteredSelected ? '取消全选' : '全选当前列表'}
          </button>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setSelected(new Set())}
            disabled={busy || selected.size === 0}
          >
            清空选择
          </button>
          <span className="text-xs text-gray-500">
            已选 {selected.size} / 显示 {filtered.length} / 共 {groups.length}
          </span>
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 mx-1" />
          <button type="button" className="btn-danger text-xs" disabled={busy} onClick={() => void onLeave()}>
            <IconTrash size={14} /> 批量退群
          </button>
        </div>

        <OperationProgress operation={operation} fallbackText={statusText} onCancel={requestCancelOperation} />
      </div>

      {lastResult && lastResult.failed > 0 && (
        <div className="card p-3 text-xs space-y-1 max-h-32 overflow-y-auto">
          <div className="font-medium text-red-500">失败明细</div>
          {lastResult.results
            .filter((r) => !r.ok)
            .map((r) => (
              <div key={String(r.id)} className="text-gray-500">
                {r.id}: {r.message}
              </div>
            ))}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/40">
                <th className="px-3 py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    disabled={busy}
                    ref={(el) => {
                      if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected
                    }}
                    onChange={selectAllFiltered}
                  />
                </th>
                <th className="px-3 py-2.5 w-12">头像</th>
                <th className="px-3 py-2.5">群号 / 群名</th>
                <th className="px-3 py-2.5">人数</th>
                <th className="px-3 py-2.5">备注</th>
                <th className="px-3 py-2.5 min-w-[120px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-gray-400">
                    无匹配群聊
                  </td>
                </tr>
              ) : (
                filtered.map((g) => {
                  const id = gid(g)
                  const checked = selected.has(id)
                  const label = g.group_name || id
                  return (
                    <tr
                      key={id}
                      className={`border-b border-gray-50 dark:border-gray-800/60 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/5 ${
                        busy ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                      } ${
                        checked ? 'bg-indigo-50/60 dark:bg-indigo-500/10' : ''
                      }`}
                      onClick={() => toggle(id)}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={checked} disabled={busy} onChange={() => toggle(id)} />
                      </td>
                      <td className="px-3 py-2">
                        <Avatar src={groupAvatarUrl(g.group_id)} alt={label} size={40} rounded="xl" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                          {g.group_name || '-'}
                        </div>
                        <div className="font-mono text-[11px] text-gray-400">{g.group_id}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {g.member_count ?? '-'}
                        {g.max_member_count ? ` / ${g.max_member_count}` : ''}
                      </td>
                      <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate" title={g.group_remark || ''}>
                        {g.group_remark || '-'}
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 disabled:opacity-40"
                            disabled={busy}
                            onClick={() => onRemarkOne(g.group_id, label, g.group_remark)}
                          >
                            备注
                          </button>
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-40"
                            disabled={busy}
                            onClick={() => onRowLeave(id, label)}
                          >
                            退群
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {lastResult && lastResult.success > 0 && lastResult.failed === 0 && (
        <div className="text-xs text-emerald-600 flex items-center gap-1">
          <IconCheck size={14} /> 上次退群全部成功 ({lastResult.success})
        </div>
      )}
    </div>
  )
}
