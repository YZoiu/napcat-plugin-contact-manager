import { useEffect, useMemo, useState } from 'react'

interface Props {
  title: string
  rows?: number
}

export default function ListSkeleton({ title, rows = 8 }: Props) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 250)
    return () => window.clearInterval(timer)
  }, [])

  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  const progress = useMemo(() => {
    const seconds = elapsedMs / 1000
    if (seconds < 0.4) return 12
    if (seconds < 1.2) return 28
    if (seconds < 2.4) return 46
    if (seconds < 4) return 63
    if (seconds < 7) return 78
    return 90
  }, [elapsedMs])

  const stageText = progress < 35
    ? '请求联系人列表'
    : progress < 65
      ? '等待 NapCat 返回'
      : progress < 90
        ? '整理分组与头像'
        : '仍在等待 NapCat 响应'

  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
            <div className="text-xs text-gray-400 mt-1">
              {stageText} · 已等待 <span className="tabular-nums">{elapsedSeconds}s</span>
            </div>
          </div>
          <div className="text-xs tabular-nums font-medium text-indigo-500">{progress}%</div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800" aria-label={`同步进度 ${progress}%`}>
          <div
            className="h-full origin-left rounded-full bg-indigo-500 transition-transform duration-150 ease-out"
            style={{ transform: `scaleX(${progress / 100})` }}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="skeleton-line h-9" />
          <div className="skeleton-line h-9" />
          <div className="skeleton-line h-9" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 px-3 py-3">
              <div className="skeleton-line size-10 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="skeleton-line h-3 w-2/5" />
                <div className="skeleton-line h-3 w-1/4" />
              </div>
              <div className="hidden sm:block skeleton-line h-6 w-24" />
              <div className="skeleton-line h-7 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
