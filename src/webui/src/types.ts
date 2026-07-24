/** WebUI 前端类型 */

export interface PluginConfig {
  enabled: boolean
  debug: boolean
  allowBatchDeleteFriend: boolean
  allowBatchLeaveGroup: boolean
  allowBatchMoveCategory: boolean
  requireConfirm: boolean
  operationDelayMs: number
  deleteFriendBlock: boolean
  deleteFriendBothDel: boolean
}

export interface PluginStatus {
  pluginName: string
  uptime: number
  uptimeFormatted: string
  selfId?: string
  selfNickname?: string
  config: PluginConfig
  stats: {
    processed: number
    todayProcessed: number
    lastUpdateDay: string
    friendsDeleted: number
    groupsLeft: number
    categoriesMoved: number
    remarksSet: number
  }
}

export interface FriendItem {
  user_id: number | string
  nickname: string
  remark: string
  sex?: string
  age?: number
  categoryId?: number
  category_id?: number
}

export interface FriendCategory {
  categoryId: number
  categoryName: string
  categoryMbCount: number
  buddyList: FriendItem[]
}

export interface GroupItem {
  group_id: number | string
  group_name: string
  member_count?: number
  max_member_count?: number
  group_remark?: string
}

export interface BatchItemResult {
  id: string | number
  ok: boolean
  message?: string
}

export interface BatchOpResult {
  total: number
  success: number
  failed: number
  results: BatchItemResult[]
}

export interface ApiResponse<T = unknown> {
  code: number
  data?: T
  message?: string
}
