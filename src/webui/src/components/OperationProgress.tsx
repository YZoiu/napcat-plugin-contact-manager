import { IconX } from './icons'

export interface OperationProgressState {
  title: string
  total: number
  done: number
  success: number
  failed: number
  current?: string
  cancelRequested: boolean
}

interface Props {
  operation: OperationProgressState | null
  fallbackText?: string
  onCancel: () => void
}

export default function OperationProgress({ operation, fallbackText, onCancel }: Props) {
  if (!operation) {
    if (!fallbackText) return null
    return (
      <div className="text-xs flex items-center gap-2 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-gray-500">
        <span className="break-all">{fallbackText}</span>
      </div>
    )
  }

  const percent = operation.total > 0 ? Math.round((operation.done / operation.total) * 100) : 0
  const remaining = Math.max(operation.total - operation.done, 0)

  return (
    <div
      className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-3 py-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="loading-spinner !w-3.5 !h-3.5 !border-[1.5px] text-amber-600 dark:text-amber-300" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {operation.cancelRequested ? '正在取消操作' : operation.title}
            </div>
            <div className="text-xs text-amber-700/80 dark:text-amber-200/80 tabular-nums truncate">
              已完成 {operation.done} / {operation.total} · 成功 {operation.success} · 失败 {operation.failed} · 剩余 {remaining}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-400/30 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={operation.cancelRequested}
          onClick={onCancel}
        >
          <IconX size={14} />
          {operation.cancelRequested ? '取消中' : '取消操作'}
        </button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-950/40">
        <div
          className="h-full origin-left rounded-full bg-amber-500 transition-transform duration-150 ease-out"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
      {operation.current && (
        <div className="mt-2 text-xs text-amber-700/80 dark:text-amber-200/80 break-all">
          当前处理：{operation.current}
        </div>
      )}
    </div>
  )
}
