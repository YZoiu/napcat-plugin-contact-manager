import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { noAuthFetch, postJson } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { BatchItemResult, BatchOpResult, FriendCategory, FriendItem, PluginConfig } from '../types'
import { IconSearch, IconRefresh, IconTrash, IconFolder, IconCheck } from '../components/icons'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import { friendAvatarUrl } from '../utils/avatar'
import OperationProgress, { type OperationProgressState } from '../components/OperationProgress'
import ListSkeleton from '../components/ListSkeleton'

interface Props {
  config?: PluginConfig
  onOpDone?: () => void
}

type FlatFriend = FriendItem & { categoryId: number; categoryName: string }

function uidKey(f: FriendItem): string {
  const id = f.user_id ?? (f as any).uin ?? (f as any).userId
  return String(id ?? '')
}

function isVirtualFriendCategory(id: number): boolean {
  return [9999].includes(Number(id))
}

export default function FriendsPage({ config, onOpDone }: Props) {
  const [categories, setCategories] = useState<FriendCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targetCategoryId, setTargetCategoryId] = useState<string>('')
  const [remarkDraft, setRemarkDraft] = useState('')
  const [lastResult, setLastResult] = useState<BatchOpResult | null>(null)
  const [newCatName, setNewCatName] = useState('')
  const [statusText, setStatusText] = useState('')
  const [operation, setOperation] = useState<OperationProgressState | null>(null)
  const [confirmState, setConfirmState] = useState<{
    open: boolean
    title: string
    message: string
    action: 'delete' | 'move' | null
  }>({ open: false, title: '', message: '', action: null })
  // 删除分组弹窗
  const [delCatModal, setDelCatModal] = useState<{
    open: boolean
    categoryId: number
    categoryName: string
    memberCount: number
    friendUins: string[]
    memberAction: 'move' | 'delete'
    targetCategoryId: string
  }>({
    open: false,
    categoryId: 0,
    categoryName: '',
    memberCount: 0,
    friendUins: [],
    memberAction: 'move',
    targetCategoryId: '',
  })
  // 确认时用的选中快照，避免异步过程中 selected 被清空
  const pendingIdsRef = useRef<string[]>([])
  const pendingCategoryRef = useRef<string>('')
  const cancelOperationRef = useRef(false)

  const requireConfirm = config?.requireConfirm !== false

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await noAuthFetch<FriendCategory[]>('/friends')
      if (res.code === 0 && res.data) {
        const nextCategories = res.data
        const movableCategories = nextCategories.filter((c) => !isVirtualFriendCategory(c.categoryId))
        setCategories(nextCategories)
        setTargetCategoryId((prev) => {
          if (prev && movableCategories.some((c) => String(c.categoryId) === prev)) return prev
          return movableCategories[0] ? String(movableCategories[0].categoryId) : ''
        })
        setCategoryFilter((prev) =>
          prev !== 'all' && !nextCategories.some((c) => String(c.categoryId) === prev) ? 'all' : prev
        )
      } else {
        showToast(res.message || '获取好友失败', 'error')
      }
    } catch {
      showToast('获取好友列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const flat: FlatFriend[] = useMemo(() => {
    const list: FlatFriend[] = []
    for (const c of categories) {
      if (isVirtualFriendCategory(c.categoryId)) continue
      for (const f of c.buddyList || []) {
        list.push({
          ...f,
          categoryId: c.categoryId,
          categoryName: c.categoryName,
        })
      }
    }
    return list
  }, [categories])

  const movableCategories = useMemo(
    () => categories.filter((c) => !isVirtualFriendCategory(c.categoryId)),
    [categories]
  )

  const filterSource: FlatFriend[] = useMemo(() => {
    if (categoryFilter === 'all') return flat
    const category = categories.find((c) => String(c.categoryId) === categoryFilter)
    if (!category) return []
    return (category.buddyList || []).map((f) => ({
      ...f,
      categoryId: category.categoryId,
      categoryName: category.categoryName,
    }))
  }, [categories, categoryFilter, flat])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return filterSource.filter((f) => {
      if (!q) return true
      return (
        String(f.user_id).includes(q) ||
        (f.nickname || '').toLowerCase().includes(q) ||
        (f.remark || '').toLowerCase().includes(q) ||
        (f.categoryName || '').toLowerCase().includes(q)
      )
    })
  }, [filterSource, search])

  const toggle = (id: string) => {
    if (busy) return
    if (!id || id === 'undefined' || id === 'null') return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** 当前筛选列表是否已全部选中（不要求 selected.size === filtered.length） */
  const allFilteredSelected = useMemo(() => {
    if (filtered.length === 0) return false
    return filtered.every((f) => {
      const k = uidKey(f)
      return k && selected.has(k)
    })
  }, [filtered, selected])

  const someFilteredSelected = useMemo(() => {
    if (filtered.length === 0) return false
    return filtered.some((f) => selected.has(uidKey(f)))
  }, [filtered, selected])

  /** 全选/取消全选：只操作当前筛选结果，避免「已全选却无法反选」 */
  const selectAllFiltered = () => {
    if (busy) return
    if (filtered.length === 0) {
      showToast('当前列表为空', 'warning')
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const f of filtered) {
          const k = uidKey(f)
          if (k) next.delete(k)
        }
      } else {
        for (const f of filtered) {
          const k = uidKey(f)
          if (k) next.add(k)
        }
      }
      return next
    })
  }

  const runBatch = async (
    title: string,
    ids: string[],
    fn: (id: string) => Promise<void>
  ) => {
    if (ids.length === 0) {
      showToast('请先选择好友', 'warning')
      setStatusText('未选择好友')
      return
    }
    setBusy(true)
    setLastResult(null)
    cancelOperationRef.current = false
    const baseOperation: OperationProgressState = {
      title: `${title}进行中（${ids.length} 人）`,
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
          await fn(id)
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
        ? `${title}已取消：成功 ${success}，失败 ${failed}，未处理 ${ids.length - success - failed}`
        : `${title}：成功 ${success}，失败 ${failed}`
      showToast(msg, cancelled || failed ? 'warning' : 'success')
      setStatusText(msg)
      if (failed > 0) {
        const samples = results
          .filter((r) => !r.ok)
          .slice(0, 5)
          .map((r) => `${r.id}: ${r.message || 'unknown'}`)
          .join('\n')
        if (samples) showToast(samples, 'error')
      }
      setSelected(new Set())
      await load()
      onOpDone?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast(msg || '操作失败', 'error')
      setStatusText(`错误: ${msg}`)
      console.error('[contact-manager]', title, e)
    } finally {
      setBusy(false)
      setOperation(null)
      cancelOperationRef.current = false
    }
  }

  const requestCancelOperation = () => {
    if (!operation) return
    cancelOperationRef.current = true
    setOperation((s) => (s ? { ...s, cancelRequested: true } : s))
    setStatusText('正在取消，当前请求完成后停止')
  }

  const doDelete = (ids: string[]) =>
    runBatch('删除好友', ids, async (id) => {
      const res = await postJson<BatchOpResult>('/friends/delete', { user_ids: [id] })
      if (res.code !== 0) throw new Error(res.message || '删除失败')
      if (!res.data) throw new Error('删除接口无返回数据')
      const first = res.data.results?.[0]
      if (res.data.failed > 0 || first?.ok === false) throw new Error(first?.message || '删除失败')
    })

  const doMove = (ids: string[], categoryId: string) =>
    runBatch('移动分组', ids, async (id) => {
      const res = await postJson<BatchOpResult>('/friends/move-category', {
        user_ids: [id],
        category_id: Number(categoryId),
      })
      if (res.code !== 0) throw new Error(res.message || '移动失败')
      if (!res.data) throw new Error('移动接口无返回数据')
      const first = res.data.results?.[0]
      if (res.data.failed > 0 || first?.ok === false) throw new Error(first?.message || '移动失败')
    })

  const onDelete = () => {
    if (busy) return
    if (config?.allowBatchDeleteFriend === false) {
      showToast('已在配置中禁止批量删除好友', 'warning')
      setStatusText('配置禁止批量删除')
      return
    }
    if (selected.size === 0) {
      showToast('请先选择好友', 'warning')
      setStatusText('请先勾选好友再删除')
      return
    }
    const ids = Array.from(selected).map(String)
    pendingIdsRef.current = ids
    if (!requireConfirm) {
      void doDelete(ids)
      return
    }
    // 注意：iframe 内 window.confirm 常被拦截，必须用页内弹窗
    setConfirmState({
      open: true,
      title: '确认批量删除',
      message: `将删除 ${ids.length} 个好友，此操作不可撤销。\n\n示例: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '…' : ''}`,
      action: 'delete',
    })
  }

  const onMove = () => {
    if (busy) return
    if (config?.allowBatchMoveCategory === false) {
      showToast('已在配置中禁止批量移动分组', 'warning')
      setStatusText('配置禁止移动分组')
      return
    }
    if (selected.size === 0) {
      showToast('请先选择好友', 'warning')
      setStatusText('请先勾选好友再移动')
      return
    }
    if (!targetCategoryId) {
      showToast('请选择目标分组', 'warning')
      setStatusText('请选择目标分组')
      return
    }
    const ids = Array.from(selected).map(String)
    pendingIdsRef.current = ids
    pendingCategoryRef.current = targetCategoryId
    const catName = categories.find((c) => String(c.categoryId) === targetCategoryId)?.categoryName || targetCategoryId
    if (!requireConfirm) {
      void doMove(ids, targetCategoryId)
      return
    }
    setConfirmState({
      open: true,
      title: '确认移动分组',
      message: `将 ${ids.length} 个好友移动到「${catName}」(#${targetCategoryId})。`,
      action: 'move',
    })
  }

  const onConfirmDialog = () => {
    const action = confirmState.action
    const ids = pendingIdsRef.current
    setConfirmState((s) => ({ ...s, open: false, action: null }))
    if (action === 'delete') void doDelete(ids)
    else if (action === 'move') void doMove(ids, pendingCategoryRef.current)
  }

  const onCancelDialog = () => {
    setConfirmState((s) => ({ ...s, open: false, action: null }))
    setStatusText('已取消')
  }

  const onSetRemark = () => {
    if (busy) return
    if (selected.size === 0) {
      showToast('请先选择好友', 'warning')
      setStatusText('请先勾选好友')
      return
    }
    const remark = remarkDraft
    const ids = Array.from(selected).map(String)
    void runBatch('设置备注', ids, async (id) => {
      const res = await postJson('/friends/remark', { user_id: id, remark })
      if (res.code !== 0) throw new Error(res.message || '设置备注失败')
    })
  }

  const onCreateCategory = async () => {
    if (busy) return
    const name = newCatName.trim()
    if (!name) {
      showToast('请输入分组名', 'warning')
      return
    }
    setBusy(true)
    try {
      const res = await postJson('/friends/category/create', { name })
      if (res.code !== 0) throw new Error(res.message || '创建失败')
      showToast(`已创建分组「${name}」`, 'success')
      setNewCatName('')
      await load()
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  /** 单人：删除 */
  const onRowDelete = (id: string, label: string) => {
    if (busy) return
    if (config?.allowBatchDeleteFriend === false) {
      showToast('已在配置中禁止删除好友', 'warning')
      return
    }
    pendingIdsRef.current = [id]
    if (!requireConfirm) {
      void doDelete([id])
      return
    }
    setConfirmState({
      open: true,
      title: '确认删除好友',
      message: `将删除好友 ${label}（${id}），此操作不可撤销。`,
      action: 'delete',
    })
  }

  /** 单人：移动到工具栏所选目标分组 */
  const onRowMove = (id: string, label: string) => {
    if (busy) return
    if (config?.allowBatchMoveCategory === false) {
      showToast('已在配置中禁止移动分组', 'warning')
      return
    }
    if (!targetCategoryId) {
      showToast('请先在上方选择目标分组', 'warning')
      return
    }
    const catName =
      categories.find((c) => String(c.categoryId) === targetCategoryId)?.categoryName || targetCategoryId
    pendingIdsRef.current = [id]
    pendingCategoryRef.current = targetCategoryId
    if (!requireConfirm) {
      void doMove([id], targetCategoryId)
      return
    }
    setConfirmState({
      open: true,
      title: '确认移动分组',
      message: `将 ${label}（${id}）移动到「${catName}」。`,
      action: 'move',
    })
  }

  /** 单人：备注（页内 prompt 在 iframe 也可能被拦，改用 status + 工具栏备注框；这里用自定义简易输入） */
  const [remarkModal, setRemarkModal] = useState<{ open: boolean; id: string; label: string; value: string }>({
    open: false,
    id: '',
    label: '',
    value: '',
  })

  const onRowRemark = (id: string, label: string, currentRemark: string) => {
    if (busy) return
    setRemarkModal({ open: true, id, label, value: currentRemark || '' })
  }

  const submitRowRemark = async () => {
    const { id, value } = remarkModal
    setRemarkModal((s) => ({ ...s, open: false }))
    if (!id) return
    setBusy(true)
    setStatusText(`设置备注 ${id}…`)
    try {
      const res = await postJson('/friends/remark', { user_id: id, remark: value })
      if (res.code !== 0) throw new Error(res.message || '设置备注失败')
      showToast('备注已更新', 'success')
      setStatusText('备注已更新')
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

  const isProtectedCategory = (id: number) => [0, 999, 9999].includes(id)

  const openDeleteCategory = (c: FriendCategory) => {
    if (busy) return
    if (isProtectedCategory(c.categoryId)) {
      showToast('系统/默认分组不可删除', 'warning')
      return
    }
    const uins = (c.buddyList || []).map((f) => String(f.user_id)).filter(Boolean)
    // 默认目标：第一个非本分组
    const fallback = movableCategories.find((x) => x.categoryId !== c.categoryId)
    setDelCatModal({
      open: true,
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      memberCount: uins.length,
      friendUins: uins,
      memberAction: 'move',
      targetCategoryId: fallback ? String(fallback.categoryId) : '',
    })
  }

  const submitDeleteCategory = async () => {
    const m = delCatModal
    if (!m.open) return
    if (m.memberAction === 'move' && !m.targetCategoryId) {
      showToast('请选择移动目标分组', 'warning')
      return
    }
    if (m.memberAction === 'move' && Number(m.targetCategoryId) === m.categoryId) {
      showToast('目标分组不能与待删分组相同', 'warning')
      return
    }
    setDelCatModal((s) => ({ ...s, open: false }))
    setBusy(true)
    setStatusText(`删除分组「${m.categoryName}」…`)
    try {
      const res = await postJson<{
        memberResult: BatchOpResult
        categoryDeleted: boolean
      }>('/friends/category/delete', {
        category_id: m.categoryId,
        category_name: m.categoryName,
        member_action: m.memberAction,
        target_category_id: m.memberAction === 'move' ? Number(m.targetCategoryId) : undefined,
        friend_uins: m.friendUins,
      })
      if (res.code !== 0) throw new Error(res.message || '删除分组失败')
      const mr = res.data?.memberResult
      const msg =
        m.memberCount === 0
          ? `分组「${m.categoryName}」已删除`
          : `分组「${m.categoryName}」已删除；好友处理 成功 ${mr?.success ?? 0} / 失败 ${mr?.failed ?? 0}`
      showToast(msg, mr && mr.failed > 0 ? 'warning' : 'success')
      setStatusText(msg)
      if (categoryFilter === String(m.categoryId)) setCategoryFilter('all')
      await load()
      onOpDone?.()
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      showToast(err, 'error')
      setStatusText(`错误: ${err}`)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <ListSkeleton title="加载好友列表" rows={9} />
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        danger={confirmState.action === 'delete'}
        confirmText={confirmState.action === 'delete' ? '确认删除' : '确认移动'}
        onConfirm={onConfirmDialog}
        onCancel={onCancelDialog}
      />

      <Modal
        open={remarkModal.open}
        onClose={() => setRemarkModal((s) => ({ ...s, open: false }))}
        maxWidth="sm"
      >
        <div className="p-5">
          <h3 className="text-sm font-semibold mb-1 text-gray-900 dark:text-white">设置备注</h3>
          <p className="text-xs text-gray-500 mb-3">
            {remarkModal.label}（{remarkModal.id}）
          </p>
          <input
            className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#161618] px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-indigo-400/40"
            value={remarkModal.value}
            onChange={(e) => setRemarkModal((s) => ({ ...s, value: e.target.value }))}
            placeholder="备注（可留空清空）"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitRowRemark()
            }}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary text-xs" onClick={() => setRemarkModal((s) => ({ ...s, open: false }))}>
              取消
            </button>
            <button type="button" className="btn-primary text-xs" onClick={() => void submitRowRemark()}>
              保存
            </button>
          </div>
        </div>
      </Modal>

      {/* 分组管理 */}
      <div className="card p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">好友分组</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">点击筛选 · 可删除分组并处理组内好友</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#161618] px-3 py-1.5 w-32 sm:w-40"
              placeholder="新分组名"
              value={newCatName}
              disabled={busy}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onCreateCategory()
              }}
            />
            <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => void onCreateCategory()}>
              创建
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              categoryFilter === 'all'
                ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                : 'bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-300'
            }`}
          >
            全部
            <span className={`tabular-nums ${categoryFilter === 'all' ? 'text-white/80' : 'text-gray-400'}`}>
              {flat.length}
            </span>
          </button>
          {categories.map((c) => {
            const count = c.buddyList?.length ?? c.categoryMbCount ?? 0
            const active = categoryFilter === String(c.categoryId)
            const protectedCat = isProtectedCategory(c.categoryId)
            return (
              <div
                key={c.categoryId}
                className={`inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full text-xs font-medium border transition ${
                  active
                    ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                    : 'bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                }`}
              >
                <button type="button" className="inline-flex items-center gap-1.5 disabled:cursor-not-allowed" disabled={busy} onClick={() => setCategoryFilter(String(c.categoryId))}>
                  {c.categoryName}
                  <span className={`tabular-nums ${active ? 'text-white/80' : 'text-gray-400'}`}>{count}</span>
                </button>
                {!protectedCat && (
                  <button
                    type="button"
                    title="删除分组"
                    disabled={busy}
                    className={`ml-0.5 p-1 rounded-full transition ${
                      active
                        ? 'hover:bg-white/20 text-white/90'
                        : 'hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500'
                    }`}
                    onClick={() => openDeleteCategory(c)}
                  >
                    <IconTrash size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 工具栏 */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#161618] outline-none focus:ring-2 focus:ring-indigo-400/40 focus:bg-white dark:focus:bg-[#1e1e20]"
              placeholder="搜索 QQ / 昵称 / 备注 / 分组"
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
            {allFilteredSelected ? '取消全选' : '全选当前'}
          </button>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setSelected(new Set())}
            disabled={busy || selected.size === 0}
          >
            清空
          </button>
          <span className="text-xs text-gray-500 tabular-nums px-1">
            已选 <b className="text-indigo-500">{selected.size}</b> / {filtered.length}
          </span>

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 mx-0.5" />

          <select
            className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#161618] px-2 py-1.5 max-w-[140px]"
            value={targetCategoryId}
            disabled={busy}
            onChange={(e) => setTargetCategoryId(e.target.value)}
            title="批量移动 / 单人移动 的目标分组"
          >
            {movableCategories.map((c) => (
              <option key={c.categoryId} value={String(c.categoryId)}>
                移至 · {c.categoryName}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary text-xs" disabled={busy || selected.size === 0} onClick={onMove}>
            <IconFolder size={14} /> 移动
          </button>
          <button type="button" className="btn-danger text-xs" disabled={busy || selected.size === 0} onClick={onDelete}>
            <IconTrash size={14} /> 删除
          </button>

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 mx-0.5" />

          <input
            className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#161618] px-2 py-1.5 w-28"
            placeholder="统一备注"
            value={remarkDraft}
            disabled={busy}
            onChange={(e) => setRemarkDraft(e.target.value)}
          />
          <button type="button" className="btn-secondary text-xs" disabled={busy || selected.size === 0} onClick={onSetRemark}>
            备注
          </button>
        </div>

        <OperationProgress operation={operation} fallbackText={statusText} onCancel={requestCancelOperation} />
      </div>

      <Modal
        open={delCatModal.open}
        onClose={() => setDelCatModal((s) => ({ ...s, open: false }))}
        maxWidth="md"
      >
        <div className="p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">删除分组</h3>
          <p className="text-sm text-gray-500 mb-4">
            「{delCatModal.categoryName}」内有 <b className="text-indigo-500">{delCatModal.memberCount}</b> 个好友，请选择处理方式：
          </p>

          <div className="space-y-2 mb-4">
            <label
              className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition ${
                delCatModal.memberAction === 'move'
                  ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="memberAction"
                checked={delCatModal.memberAction === 'move'}
                onChange={() => setDelCatModal((s) => ({ ...s, memberAction: 'move' }))}
                className="mt-1 accent-indigo-500"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white">移动到其他分组</div>
                <div className="text-xs text-gray-400 mt-0.5 mb-2">先转移好友，再删除空分组</div>
                {delCatModal.memberAction === 'move' && (
                  <select
                    className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#161618] px-2 py-1.5"
                    value={delCatModal.targetCategoryId}
                    onChange={(e) => setDelCatModal((s) => ({ ...s, targetCategoryId: e.target.value }))}
                  >
                    {movableCategories
                      .filter((c) => c.categoryId !== delCatModal.categoryId)
                      .map((c) => (
                        <option key={c.categoryId} value={String(c.categoryId)}>
                          {c.categoryName} ({c.buddyList?.length ?? 0})
                        </option>
                      ))}
                  </select>
                )}
              </div>
            </label>

            <label
              className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition ${
                delCatModal.memberAction === 'delete'
                  ? 'border-red-300 bg-red-50/50 dark:bg-red-500/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="memberAction"
                checked={delCatModal.memberAction === 'delete'}
                onChange={() => setDelCatModal((s) => ({ ...s, memberAction: 'delete' }))}
                className="mt-1 accent-red-500"
              />
              <div>
                <div className="text-sm font-medium text-red-600 dark:text-red-400">一并删除组内好友</div>
                <div className="text-xs text-gray-400 mt-0.5">危险：会删除该分组下全部好友</div>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setDelCatModal((s) => ({ ...s, open: false }))}>
              取消
            </button>
            <button
              type="button"
              className={delCatModal.memberAction === 'delete' ? 'btn-danger text-sm' : 'btn-primary text-sm'}
              disabled={busy}
              onClick={() => void submitDeleteCategory()}
            >
              {delCatModal.memberAction === 'delete' ? '删除分组+好友' : '移动后删除分组'}
            </button>
          </div>
        </div>
      </Modal>

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

      {/* 列表 */}
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
                <th className="px-3 py-2.5">QQ / 昵称</th>
                <th className="px-3 py-2.5">备注</th>
                <th className="px-3 py-2.5">分组</th>
                <th className="px-3 py-2.5 min-w-[160px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-gray-400">
                    无匹配好友
                  </td>
                </tr>
              ) : (
                filtered.map((f) => {
                  const id = uidKey(f)
                  const checked = selected.has(id)
                  const label = f.remark || f.nickname || id
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
                        <Avatar
                          src={friendAvatarUrl(f.user_id)}
                          alt={label}
                          size={40}
                          rounded="xl"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                          {f.nickname || '-'}
                        </div>
                        <div className="font-mono text-[11px] text-gray-400">{f.user_id}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate" title={f.remark || ''}>
                        {f.remark || '-'}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                          {f.categoryName}
                          <span className="opacity-50">#{f.categoryId}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 disabled:opacity-40"
                            disabled={busy}
                            onClick={() => onRowRemark(id, label, f.remark || '')}
                          >
                            备注
                          </button>
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 disabled:opacity-40"
                            disabled={busy || !targetCategoryId}
                            title={targetCategoryId ? '移动到上方所选目标分组' : '请先选择目标分组'}
                            onClick={() => onRowMove(id, label)}
                          >
                            移动
                          </button>
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-40"
                            disabled={busy}
                            onClick={() => onRowDelete(id, label)}
                          >
                            删除
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
          <IconCheck size={14} /> 上次批量操作全部成功 ({lastResult.success})
        </div>
      )}
    </div>
  )
}
