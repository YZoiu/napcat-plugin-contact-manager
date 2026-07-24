import { useState, type CSSProperties } from 'react'

interface Props {
  src: string
  alt?: string
  /** 边长（正方形） */
  size?: number
  /** 圆角矩形 / 圆形 */
  rounded?: 'md' | 'lg' | 'xl' | 'full'
  className?: string
}

const radiusMap = {
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
} as const

/** 正方形头像（默认圆角矩形），object-cover 防拉伸成竖条 */
export default function Avatar ({
  src,
  alt = '',
  size = 40,
  rounded = 'xl',
  className = '',
}: Props) {
  const [failed, setFailed] = useState(false)
  const letter = (alt || '?').trim().charAt(0).toUpperCase() || '?'
  const radius = radiusMap[rounded] || radiusMap.xl
  const box: CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    maxWidth: size,
    maxHeight: size,
    aspectRatio: '1 / 1',
  }

  if (!src || failed) {
    return (
      <div
        className={`${radius} flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-500/25 dark:to-violet-500/20 text-indigo-600 dark:text-indigo-300 text-xs font-semibold select-none overflow-hidden ${className}`}
        style={box}
        title={alt}
      >
        {letter}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`${radius} flex-shrink-0 object-cover object-center bg-gray-100 dark:bg-gray-800 overflow-hidden ${className}`}
      style={box}
      onError={() => setFailed(true)}
    />
  )
}
