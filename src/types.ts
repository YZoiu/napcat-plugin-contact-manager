/**
 * 联系人批量管理插件 - 类型定义
 */

// ==================== 插件配置 ====================

export interface PluginConfig {
  /** 全局开关 */
  enabled: boolean;
  /** 调试模式 */
  debug: boolean;
  /** 是否允许批量删除好友 */
  allowBatchDeleteFriend: boolean;
  /** 是否允许批量退群 */
  allowBatchLeaveGroup: boolean;
  /** 是否允许批量移动好友分组 */
  allowBatchMoveCategory: boolean;
  /** 危险操作是否需要前端二次确认（仅作提示开关，后端仍会执行） */
  requireConfirm: boolean;
  /** 批量操作间隔（毫秒），降低风控风险 */
  operationDelayMs: number;
  /** 删好友时是否拉黑 */
  deleteFriendBlock: boolean;
  /** 删好友时是否双向删除 */
  deleteFriendBothDel: boolean;
}

// ==================== 联系人数据 ====================

export interface FriendItem {
  user_id: number | string;
  nickname: string;
  remark: string;
  sex?: string;
  age?: number;
  category_id?: number;
  categoryId?: number;
  [key: string]: unknown;
}

export interface FriendCategory {
  categoryId: number;
  categoryName: string;
  categoryMbCount: number;
  buddyList: FriendItem[];
}

export interface GroupItem {
  group_id: number | string;
  group_name: string;
  member_count?: number;
  max_member_count?: number;
  group_remark?: string;
  [key: string]: unknown;
}

// ==================== 批量操作结果 ====================

export interface BatchItemResult {
  id: string | number;
  ok: boolean;
  message?: string;
}

export interface BatchOpResult {
  total: number;
  success: number;
  failed: number;
  results: BatchItemResult[];
}

// ==================== API 响应 ====================

export interface ApiResponse<T = unknown> {
  code: number;
  message?: string;
  data?: T;
}
