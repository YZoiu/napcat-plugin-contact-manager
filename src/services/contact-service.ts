/**
 * 联系人业务：列表、批量删好友/退群、备注、分组
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import type {
  BatchItemResult,
  BatchOpResult,
  FriendCategory,
  FriendItem,
  GroupItem,
} from '../types';

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message || String(e);
  return String(e);
}

function emptyBatch(): BatchOpResult {
  return { total: 0, success: 0, failed: 0, results: [] };
}

const VIRTUAL_FRIEND_CATEGORY_IDS = new Set([9999]);

function summarize(results: BatchItemResult[]): BatchOpResult {
  return {
    total: results.length,
    success: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

/** 获取 BuddyService（分组等扩展能力） */
function getBuddyService(ctx: NapCatPluginContext): any {
  try {
    return ctx.core?.context?.session?.getBuddyService?.();
  } catch {
    return null;
  }
}

function normalizeBuddyCategory(raw: any): FriendCategory {
  return {
    categoryId: Number(raw.categoryId),
    categoryName: String(raw.categoryName ?? raw.categroyName ?? ''),
    categoryMbCount: Number(raw.categoryMbCount ?? raw.categroyMbCount ?? 0),
    buddyList: Array.isArray(raw.buddyList)
      ? raw.buddyList
      : Array.isArray(raw.buddyUids)
        ? raw.buddyUids.map((uid: unknown) => ({ user_id: String(uid), nickname: '', remark: '' }))
        : [],
  };
}

function normalizeFriendCategories(categories: FriendCategory[]): FriendCategory[] {
  return categories.map((category) => normalizeBuddyCategory(category));
}

async function listBuddyCategoriesDirect(ctx: NapCatPluginContext, pullRefresh = true): Promise<FriendCategory[]> {
  const buddy = getBuddyService(ctx);
  if (!buddy || typeof buddy.getBuddyListV2 !== 'function') return [];

  const attempts: Array<() => Promise<any>> = [
    () => Promise.resolve(buddy.getBuddyListV2('0', pullRefresh, 0)),
    () => Promise.resolve(buddy.getBuddyListV2('0', 0)),
  ];

  for (const attempt of attempts) {
    try {
      const ret = await attempt();
      const data = Array.isArray(ret?.data) ? ret.data : [];
      return data.map(normalizeBuddyCategory);
    } catch {
      // Try the next signature.
    }
  }
  return [];
}

function hasCategory(categories: FriendCategory[], categoryId: number, categoryName: string): boolean {
  const normalizedName = String(categoryName).trim();
  return categories.some((c) => Number(c.categoryId) === categoryId || String(c.categoryName).trim() === normalizedName);
}

async function uinToUid(ctx: NapCatPluginContext, uin: string | number): Promise<string | null> {
  try {
    const uid = await ctx.core.apis.UserApi.getUidByUinV2(String(uin));
    return uid || null;
  } catch (e) {
    pluginState.logDebug('uinToUid failed', uin, e);
    return null;
  }
}

// ==================== 列表 ====================

export async function listFriendsWithCategory(): Promise<FriendCategory[]> {
  const data = await pluginState.callApi<FriendCategory[]>('get_friends_with_category', {});
  return Array.isArray(data) ? normalizeFriendCategories(data) : [];
}

export async function listFriendsFlat(): Promise<FriendItem[]> {
  try {
    const cats = await listFriendsWithCategory();
    const out: FriendItem[] = [];
    for (const c of cats) {
      if (VIRTUAL_FRIEND_CATEGORY_IDS.has(Number(c.categoryId))) continue;
      for (const f of c.buddyList || []) {
        out.push({
          ...f,
          categoryId: c.categoryId,
          category_id: c.categoryId,
        });
      }
    }
    if (out.length > 0) return out;
  } catch {
    /* fallthrough */
  }
  const list = await pluginState.callApi<FriendItem[]>('get_friend_list', {});
  return Array.isArray(list) ? list : [];
}

export async function listGroups(noCache = true): Promise<GroupItem[]> {
  const data = await pluginState.callApi<GroupItem[]>('get_group_list', { no_cache: noCache });
  return Array.isArray(data) ? data : [];
}

export async function getLoginInfo(): Promise<{ user_id?: string | number; nickname?: string }> {
  return pluginState.callApi('get_login_info', {});
}

// ==================== 单条操作 ====================

function assertBuddyRet (ret: unknown, step: string): void {
  if (ret == null || ret === true || ret === 0) return;
  if (typeof ret !== 'object') return;
  const r = ret as Record<string, unknown>;
  // NT 常见：{ result: 0, errMsg: '' }
  if ('result' in r) {
    const code = Number(r.result);
    if (Number.isFinite(code) && code !== 0) {
      throw new Error(`${step} 失败 code=${code} ${String(r.errMsg ?? r.message ?? '')}`.trim());
    }
  }
  if (r.valid === false) {
    throw new Error(String(r.message || `${step} 失败`));
  }
}

export async function deleteFriend(
  userId: string | number,
  options?: { temp_block?: boolean; temp_both_del?: boolean }
): Promise<void> {
  const cfg = pluginState.config;
  const tempBlock = Boolean(options?.temp_block ?? cfg.deleteFriendBlock);
  const tempBothDel = Boolean(options?.temp_both_del ?? cfg.deleteFriendBothDel);
  const uin = String(userId).trim();
  if (!uin || uin === 'undefined' || uin === 'null') {
    throw new Error('无效的 user_id');
  }

  const ctx = pluginState.ctx;
  const errors: string[] = [];

  // 解析 UID
  let uid: string | null = null;
  try {
    uid = (await ctx.core.apis.UserApi.getUidByUinV2(uin)) || null;
  } catch (e) {
    errors.push(`getUidByUinV2: ${errMsg(e)}`);
  }
  if (!uid) {
    throw new Error(`无法解析 UID（可能不是有效 QQ 号）: ${uin}${errors.length ? ` | ${errors.join('; ')}` : ''}`);
  }

  // isBuddy 仅作提示，部分版本缓存不准，不作为硬失败
  try {
    const isBuddy = await ctx.core.apis.FriendApi.isBuddy(uid);
    pluginState.logDebug(`deleteFriend uin=${uin} uid=${uid} isBuddy=${isBuddy}`);
    if (!isBuddy) {
      pluginState.logger.warn(`isBuddy=false 仍尝试删除: ${uin} (${uid})`);
    }
  } catch (e) {
    pluginState.logDebug('isBuddy check failed', e);
  }

  // 路径 1：FriendApi.delBuddy（标准）
  try {
    const ret = await ctx.core.apis.FriendApi.delBuddy(uid, tempBlock, tempBothDel);
    assertBuddyRet(ret, 'delBuddy');
    pluginState.logger.info(`删除好友成功(FriendApi): ${uin}`);
    return;
  } catch (e) {
    errors.push(`FriendApi.delBuddy: ${errMsg(e)}`);
  }

  // 路径 2：BuddyService.delBuddy 直接调用（参数形状兼容）
  try {
    const buddy = getBuddyService(ctx);
    if (buddy?.delBuddy) {
      const shapes = [
        { friendUid: uid, tempBlock, tempBothDel },
        { friendUid: uid, tempBlock: false, tempBothDel: false },
        { uid, tempBlock, tempBothDel },
      ];
      for (const param of shapes) {
        try {
          const ret = await Promise.resolve(buddy.delBuddy(param));
          assertBuddyRet(ret, 'BuddyService.delBuddy');
          pluginState.logger.info(`删除好友成功(BuddyService): ${uin}`);
          return;
        } catch (e) {
          errors.push(`BuddyService.delBuddy(${JSON.stringify(param)}): ${errMsg(e)}`);
        }
      }
    }
  } catch (e) {
    errors.push(`BuddyService: ${errMsg(e)}`);
  }

  // 路径 3：OneBot delete_friend（callApi 已允许空 data）
  try {
    const data = await pluginState.callApi<any>('delete_friend', {
      user_id: uin,
      friend_id: uin,
      temp_block: tempBlock,
      temp_both_del: tempBothDel,
    });
    assertBuddyRet(data, 'delete_friend');
    pluginState.logger.info(`删除好友成功(action): ${uin}`);
    return;
  } catch (e) {
    errors.push(`delete_friend action: ${errMsg(e)}`);
  }

  throw new Error(`删除好友失败 ${uin} (uid=${uid}): ${errors.join(' | ')}`);
}

/** 诊断：不删除，只检查 uin→uid / isBuddy */
export async function probeFriend (userId: string | number): Promise<{
  uin: string;
  uid: string | null;
  isBuddy: boolean | null;
  error?: string;
}> {
  const uin = String(userId).trim();
  try {
    const ctx = pluginState.ctx;
    const uid = (await ctx.core.apis.UserApi.getUidByUinV2(uin)) || null;
    let isBuddy: boolean | null = null;
    if (uid) {
      try {
        isBuddy = await ctx.core.apis.FriendApi.isBuddy(uid);
      } catch {
        isBuddy = null;
      }
    }
    return { uin, uid, isBuddy };
  } catch (e) {
    return { uin, uid: null, isBuddy: null, error: errMsg(e) };
  }
}

export async function leaveGroup(groupId: string | number): Promise<void> {
  await pluginState.callApi('set_group_leave', {
    group_id: String(groupId),
  });
}

export async function setFriendRemark(userId: string | number, remark: string): Promise<void> {
  await pluginState.callApi('set_friend_remark', {
    user_id: String(userId),
    remark: String(remark ?? ''),
  });
}

export async function setGroupRemark(groupId: string | number, remark: string): Promise<void> {
  await pluginState.callApi('set_group_remark', {
    group_id: String(groupId),
    remark: String(remark ?? ''),
  });
}

/**
 * 移动好友到指定分组（NT BuddyService）
 * 不同 QQ 版本签名可能略有差异，做多路径尝试
 */
export async function moveFriendCategory(
  ctx: NapCatPluginContext,
  userId: string | number,
  categoryId: number
): Promise<void> {
  const buddy = getBuddyService(ctx);
  if (!buddy) throw new Error('BuddyService 不可用，当前环境可能不支持移动分组');

  const uid = await uinToUid(ctx, userId);
  if (!uid) throw new Error(`无法解析 UID: ${userId}`);

  const errors: string[] = [];

  const cat = Number(categoryId);

  // 路径 1：批量接口（推荐）
  try {
    if (typeof buddy.setBatchBuddyCategory === 'function') {
      // 类型声明可能是 number[]，运行时 uid 为 string
      await Promise.resolve(buddy.setBatchBuddyCategory([uid] as never, cat));
      return;
    }
  } catch (e) {
    errors.push(`setBatchBuddyCategory: ${errMsg(e)}`);
  }

  // 路径 2：单条接口
  try {
    if (typeof buddy.setBuddyCategory === 'function') {
      await Promise.resolve(buddy.setBuddyCategory(uid as never, cat));
      return;
    }
  } catch (e) {
    errors.push(`setBuddyCategory(uid): ${errMsg(e)}`);
  }

  // 路径 4：FriendApi 若有封装则使用
  try {
    const fa = ctx.core?.apis?.FriendApi as any;
    if (fa?.setBuddyCategory) {
      await fa.setBuddyCategory(uid, categoryId);
      return;
    }
  } catch (e) {
    errors.push(`FriendApi.setBuddyCategory: ${errMsg(e)}`);
  }

  throw new Error(errors.length ? errors.join(' | ') : '移动分组失败：未找到可用 API');
}

export async function createFriendCategory(ctx: NapCatPluginContext, name: string): Promise<void> {
  const buddy = getBuddyService(ctx);
  if (!buddy) throw new Error('BuddyService 不可用');
  const n = String(name || '').trim();
  if (!n) throw new Error('分组名不能为空');

  // native 断言 argc == 2：第二个参数为 buddyUids（可为空数组）
  if (typeof buddy.addCategoryV2 === 'function') {
    await buddy.addCategoryV2(n, []);
    return;
  }
  if (typeof buddy.addCategory === 'function') {
    // 部分版本仅 1 参；失败再试 2 参
    try {
      buddy.addCategory(n);
      return;
    } catch {
      buddy.addCategory(n, []);
      return;
    }
  }
  throw new Error('当前环境不支持创建好友分组');
}

export async function renameFriendCategory(
  ctx: NapCatPluginContext,
  oldName: string,
  newName: string
): Promise<void> {
  const buddy = getBuddyService(ctx);
  if (!buddy) throw new Error('BuddyService 不可用');
  if (typeof buddy.renameCategory !== 'function') {
    throw new Error('当前环境不支持重命名好友分组');
  }
  buddy.renameCategory(String(oldName), String(newName));
}

export type DeleteCategoryMemberAction = 'move' | 'delete';

/**
 * 删除好友分组，并先处理组内好友：
 * - move: 先批量移动到目标分组，再删分组
 * - delete: 先删除组内好友，再删分组
 */
export async function deleteFriendCategory (
  ctx: NapCatPluginContext,
  opts: {
    categoryId: number;
    categoryName: string;
    memberAction: DeleteCategoryMemberAction;
    /** memberAction=move 时必填 */
    targetCategoryId?: number;
    /** 该分组下好友 QQ 号列表（由前端传入，后端也会再校验） */
    friendUins?: Array<string | number>;
  }
): Promise<{
  memberResult: BatchOpResult;
  categoryDeleted: boolean;
  categoryName: string;
  categoryId: number;
}> {
  if (!pluginState.config.enabled) throw new Error('插件已禁用');

  const categoryId = Number(opts.categoryId);
  const categoryName = String(opts.categoryName || '').trim();
  if (!Number.isFinite(categoryId)) throw new Error('无效的分组 ID');
  if (!categoryName) throw new Error('分组名不能为空');

  // 默认分组/系统分组保护（常见：我的好友=0 或 1，特别关心=999/9999）
  const protectedIds = new Set([0, 999, 9999]);
  if (protectedIds.has(categoryId)) {
    throw new Error(`系统/默认分组不可删除（id=${categoryId}）`);
  }

  // 解析组内好友：优先前端列表，否则从最新好友分组拉
  let friendUins = (opts.friendUins || []).map(String).filter(Boolean);
  if (friendUins.length === 0) {
    try {
      const cats = await listFriendsWithCategory();
      const hit = cats.find((c) => Number(c.categoryId) === categoryId);
      friendUins = (hit?.buddyList || []).map((f) => String(f.user_id)).filter(Boolean);
    } catch (e) {
      pluginState.logDebug('refresh category members failed', e);
    }
  }

  let memberResult: BatchOpResult = emptyBatch();

  if (friendUins.length > 0) {
    if (opts.memberAction === 'delete') {
      if (!pluginState.config.allowBatchDeleteFriend) {
        throw new Error('已禁止删除好友，无法「一并删除好友」后删分组');
      }
      memberResult = await batchDeleteFriends(friendUins);
      // 若全部删失败，不继续删分组
      if (memberResult.success === 0 && memberResult.failed > 0) {
        throw new Error(`组内好友删除全部失败，已取消删除分组。示例: ${memberResult.results.find((r) => !r.ok)?.message || ''}`);
      }
    } else if (opts.memberAction === 'move') {
      const targetId = Number(opts.targetCategoryId);
      if (!Number.isFinite(targetId)) throw new Error('请指定移动目标分组 targetCategoryId');
      if (targetId === categoryId) throw new Error('目标分组不能与待删分组相同');
      if (!pluginState.config.allowBatchMoveCategory) {
        throw new Error('已禁止移动分组，无法先移动好友再删分组');
      }
      memberResult = await batchMoveCategory(ctx, friendUins, targetId);
      if (memberResult.success === 0 && memberResult.failed > 0) {
        throw new Error(`组内好友移动全部失败，已取消删除分组。示例: ${memberResult.results.find((r) => !r.ok)?.message || ''}`);
      }
    } else {
      throw new Error('memberAction 必须是 move 或 delete');
    }
  }

  // 删除分组本身
  const buddy = getBuddyService(ctx);
  if (!buddy) throw new Error('BuddyService 不可用');

  const errors: string[] = [];
  let categoryDeleted = false;

  const verifyDeleted = async (label: string): Promise<boolean> => {
    await pluginState.sleep(Math.max(700, pluginState.config.operationDelayMs));
    const latest = await listBuddyCategoriesDirect(ctx, true);
    const stillExists = hasCategory(latest, categoryId, categoryName);
    pluginState.logger.info(
      `删除分组校验(${label}): exists=${stillExists} categories=${latest.map((c) => `${c.categoryId}:${c.categoryName}`).join(', ')}`
    );
    return !stillExists;
  };

  // delCategory(name) 为主；部分版本可能接受 id 字符串
  const tryDelete = async (arg: string | number, label: string) => {
    if (typeof buddy.delCategory !== 'function') {
      throw new Error('当前环境不支持 delCategory');
    }
    await Promise.resolve(buddy.delCategory(arg as never));
    if (await verifyDeleted(label)) {
      categoryDeleted = true;
      pluginState.logger.info(`删除分组成功(${label}): ${arg}`);
      return;
    }
    throw new Error(`delCategory 未生效，分组仍存在`);
  };

  const tryResortWithoutCategory = async (label: string) => {
    if (typeof buddy.resortCategory !== 'function') {
      throw new Error('当前环境不支持 resortCategory');
    }
    const latest = await listBuddyCategoriesDirect(ctx, true);
    const names = latest
      .filter((c) => Number(c.categoryId) !== categoryId && String(c.categoryName).trim() !== categoryName)
      .map((c) => c.categoryName)
      .filter(Boolean);
    await Promise.resolve(buddy.resortCategory(names));
    if (await verifyDeleted(label)) {
      categoryDeleted = true;
      pluginState.logger.info(`删除分组成功(${label}): resortCategory without ${categoryName}`);
      return;
    }
    throw new Error('resortCategory 未生效，分组仍存在');
  };

  const tryRenameThenDelete = async () => {
    if (typeof buddy.renameCategory !== 'function') {
      throw new Error('当前环境不支持 renameCategory');
    }
    const tempName = `待删除分组_${categoryId}_${Date.now()}`;
    await Promise.resolve(buddy.renameCategory(categoryName, tempName));
    await pluginState.sleep(Math.max(500, pluginState.config.operationDelayMs));
    try {
      await tryDelete(tempName, 'rename-then-delete');
    } catch (e) {
      try {
        await Promise.resolve(buddy.renameCategory(tempName, categoryName));
      } catch (restoreError) {
        errors.push(`restoreCategoryName(${tempName}->${categoryName}): ${errMsg(restoreError)}`);
      }
      throw e;
    }
  };

  const deleteAttempts = friendUins.length > 0 ? 3 : 2;
  for (let attempt = 1; attempt <= deleteAttempts && !categoryDeleted; attempt++) {
    if (attempt > 1 || friendUins.length > 0) {
      await pluginState.sleep(Math.max(500, pluginState.config.operationDelayMs));
    }

    try {
      await tryDelete(categoryName, `name#${attempt}`);
    } catch (e) {
      errors.push(`attempt=${attempt} delCategory(name=${categoryName}): ${errMsg(e)}`);
      try {
        await tryDelete(String(categoryId), `id-string#${attempt}`);
      } catch (e2) {
        errors.push(`attempt=${attempt} delCategory(id=${categoryId}): ${errMsg(e2)}`);
      }
    }
  }

  if (!categoryDeleted) {
    try {
      await tryRenameThenDelete();
    } catch (e) {
      errors.push(`renameThenDelete(${categoryName}): ${errMsg(e)}`);
    }
  }

  if (!categoryDeleted) {
    try {
      await tryResortWithoutCategory('resort-without-category');
    } catch (e) {
      errors.push(`resortCategory(without ${categoryName}): ${errMsg(e)}`);
    }
  }

  if (!categoryDeleted) {
    // 好友可能已处理成功，但分组删除失败 —— 明确告知
    const capabilities = Object.keys(buddy).filter((k) => /Category/i.test(k)).join(', ') || 'unknown';
    pluginState.logger.error(`删除分组失败详情: methods=${capabilities}; ${errors.join(' | ')}`);
    throw new Error(
      `好友已处理(成功${memberResult.success}/失败${memberResult.failed})，但删除分组失败: ${errors.join(' | ')}`
    );
  }

  return {
    memberResult,
    categoryDeleted,
    categoryName,
    categoryId,
  };
}

// ==================== 批量 ====================

export async function batchDeleteFriends(
  userIds: Array<string | number>,
  options?: { temp_block?: boolean; temp_both_del?: boolean }
): Promise<BatchOpResult> {
  if (!pluginState.config.enabled) throw new Error('插件已禁用');
  if (!pluginState.config.allowBatchDeleteFriend) throw new Error('已禁止批量删除好友（请在配置中开启）');
  if (!Array.isArray(userIds) || userIds.length === 0) return emptyBatch();

  const delay = pluginState.config.operationDelayMs;
  const results: BatchItemResult[] = [];

  for (let i = 0; i < userIds.length; i++) {
    const id = userIds[i]!;
    try {
      await deleteFriend(id, options);
      results.push({ id, ok: true });
      pluginState.increment('friendsDeleted', 1);
      pluginState.logDebug(`删除好友成功: ${id}`);
    } catch (e) {
      results.push({ id, ok: false, message: errMsg(e) });
      pluginState.logger.warn(`删除好友失败 ${id}:`, e);
    }
    if (i < userIds.length - 1 && delay > 0) await pluginState.sleep(delay);
  }

  return summarize(results);
}

export async function batchLeaveGroups(groupIds: Array<string | number>): Promise<BatchOpResult> {
  if (!pluginState.config.enabled) throw new Error('插件已禁用');
  if (!pluginState.config.allowBatchLeaveGroup) throw new Error('已禁止批量退群（请在配置中开启）');
  if (!Array.isArray(groupIds) || groupIds.length === 0) return emptyBatch();

  const delay = pluginState.config.operationDelayMs;
  const results: BatchItemResult[] = [];

  for (let i = 0; i < groupIds.length; i++) {
    const id = groupIds[i]!;
    try {
      await leaveGroup(id);
      results.push({ id, ok: true });
      pluginState.increment('groupsLeft', 1);
      pluginState.logDebug(`退群成功: ${id}`);
    } catch (e) {
      results.push({ id, ok: false, message: errMsg(e) });
      pluginState.logger.warn(`退群失败 ${id}:`, e);
    }
    if (i < groupIds.length - 1 && delay > 0) await pluginState.sleep(delay);
  }

  return summarize(results);
}

export async function batchMoveCategory(
  ctx: NapCatPluginContext,
  userIds: Array<string | number>,
  categoryId: number
): Promise<BatchOpResult> {
  if (!pluginState.config.enabled) throw new Error('插件已禁用');
  if (!pluginState.config.allowBatchMoveCategory) throw new Error('已禁止批量移动分组（请在配置中开启）');
  if (!Array.isArray(userIds) || userIds.length === 0) return emptyBatch();
  if (!Number.isFinite(Number(categoryId))) throw new Error('无效的分组 ID');

  const delay = pluginState.config.operationDelayMs;
  const results: BatchItemResult[] = [];
  const cat = Number(categoryId);

  // 先尝试真正的批量接口
  try {
    const buddy = getBuddyService(ctx);
    if (buddy && typeof buddy.setBatchBuddyCategory === 'function') {
      const uids: string[] = [];
      for (const uin of userIds) {
        const uid = await uinToUid(ctx, uin);
        if (uid) uids.push(uid);
        else results.push({ id: uin, ok: false, message: '无法解析 UID' });
      }
      if (uids.length > 0) {
        buddy.setBatchBuddyCategory(uids, cat);
        for (const uin of userIds) {
          if (!results.find((r) => String(r.id) === String(uin))) {
            results.push({ id: uin, ok: true });
          }
        }
        pluginState.increment('categoriesMoved', uids.length);
        return summarize(results);
      }
      return summarize(results);
    }
  } catch (e) {
    pluginState.logDebug('setBatchBuddyCategory failed, fallback per-user', e);
  }

  for (let i = 0; i < userIds.length; i++) {
    const id = userIds[i]!;
    try {
      await moveFriendCategory(ctx, id, cat);
      results.push({ id, ok: true });
      pluginState.increment('categoriesMoved', 1);
    } catch (e) {
      results.push({ id, ok: false, message: errMsg(e) });
    }
    if (i < userIds.length - 1 && delay > 0) await pluginState.sleep(delay);
  }

  return summarize(results);
}

export async function batchSetFriendRemarks(
  items: Array<{ user_id: string | number; remark: string }>
): Promise<BatchOpResult> {
  if (!pluginState.config.enabled) throw new Error('插件已禁用');
  if (!Array.isArray(items) || items.length === 0) return emptyBatch();

  const delay = pluginState.config.operationDelayMs;
  const results: BatchItemResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    try {
      await setFriendRemark(it.user_id, it.remark);
      results.push({ id: it.user_id, ok: true });
      pluginState.increment('remarksSet', 1);
    } catch (e) {
      results.push({ id: it.user_id, ok: false, message: errMsg(e) });
    }
    if (i < items.length - 1 && delay > 0) await pluginState.sleep(delay);
  }

  return summarize(results);
}
