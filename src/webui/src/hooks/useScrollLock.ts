import { useEffect } from 'react'

/**
 * 弹窗打开时锁定主滚动容器，避免列表被顶飞 / 背景滚动穿透。
 * 主内容在 iframe 内是 main.overflow-y-auto，同时锁 body + 最近的滚动父级。
 */
export function useScrollLock (locked: boolean) {
  useEffect(() => {
    if (!locked) return

    const scrollers: HTMLElement[] = []
    const html = document.documentElement
    const body = document.body

    // 收集可滚动祖先（含 main）
    const roots = [document.querySelector('main'), document.getElementById('root')].filter(
      Boolean
    ) as HTMLElement[]

    for (const el of [html, body, ...roots]) {
      scrollers.push(el)
    }

    // 去重
    const unique = Array.from(new Set(scrollers))
    const prev = unique.map((el) => ({
      el,
      overflow: el.style.overflow,
      overflowY: el.style.overflowY,
      paddingRight: el.style.paddingRight,
      scrollTop: el.scrollTop,
    }))

    const scrollbarGap = window.innerWidth - html.clientWidth

    for (const { el } of prev) {
      el.style.overflow = 'hidden'
      el.style.overflowY = 'hidden'
      if (scrollbarGap > 0 && (el === body || el === html)) {
        el.style.paddingRight = `${scrollbarGap}px`
      }
    }

    return () => {
      for (const p of prev) {
        p.el.style.overflow = p.overflow
        p.el.style.overflowY = p.overflowY
        p.el.style.paddingRight = p.paddingRight
        // 恢复滚动位置，避免弹窗关闭后列表跳动
        try {
          p.el.scrollTop = p.scrollTop
        } catch { /* ignore */ }
      }
    }
  }, [locked])
}
