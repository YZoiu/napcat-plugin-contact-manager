import { useCallback } from 'react'
import Modal from './Modal'

interface Props {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 确认弹窗：Portal + 滚动锁，不依赖 window.confirm */
export default function ConfirmDialog ({
  open,
  title = '确认操作',
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  const handleConfirm = useCallback(() => {
    onConfirm()
  }, [onConfirm])

  return (
    <Modal open={open} onClose={onCancel} maxWidth="sm">
      <div className="p-5">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2 tracking-tight">
          {title}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed mb-5">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`${danger ? 'btn-danger' : 'btn-primary'} text-sm`}
            onClick={handleConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}
