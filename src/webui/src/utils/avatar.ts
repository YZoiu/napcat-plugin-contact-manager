/** QQ 公开头像 CDN（无需鉴权） */

export function friendAvatarUrl(uin: string | number, size: 40 | 100 | 140 = 100): string {
  const id = String(uin || '').trim()
  if (!id) return ''
  // s=40/100/140
  return `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(id)}&s=${size}`
}

export function groupAvatarUrl(groupId: string | number, size: 40 | 100 | 140 = 100): string {
  const id = String(groupId || '').trim()
  if (!id) return ''
  return `https://p.qlogo.cn/gh/${encodeURIComponent(id)}/${encodeURIComponent(id)}/${size}`
}
