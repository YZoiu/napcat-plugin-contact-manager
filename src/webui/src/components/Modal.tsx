import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '../hooks/useScrollLock'

interface Props {
  open: boolean
  onClose: () => void
  /** 点击遮罩是否关闭，默认 true */
  closeOnBackdrop?: boolean
  /** 面板最大宽度 */
  maxWidth?: 'sm' | 'md' | 'lg'
  children: ReactNode
  /** 无障碍标题 id（可选） */
  labelledBy?: string
}

const maxWidthClass = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

/**
 * 统一弹层：Portal 到 body，避免 page-enter transform / overflow 导致 fixed 失效；
 * 锁定滚动、Esc 关闭、进出场动画。
 */
export default function Modal ({
  open,
  onClose,
  closeOnBackdrop = true,
  maxWidth = 'md',
  children,
  labelledBy,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  useScrollLock(open)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    // 只在弹窗打开时设置初始焦点；后续输入重渲染不能抢走输入框焦点。
    const t = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      if (document.activeElement && panel.contains(document.activeElement)) return

      const focusTarget = panel.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      ;(focusTarget || panel).focus({ preventScroll: true })
    }, 0)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="nc-modal-root"
      role="presentation"
    >
      <div
        className="nc-modal-backdrop"
        onClick={() => {
          if (closeOnBackdrop) onClose()
        }}
      />
      <div className="nc-modal-center" role="presentation">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy || titleId}
          tabIndex={-1}
          className={`nc-modal-panel ${maxWidthClass[maxWidth]}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
