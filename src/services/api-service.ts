/**
 * WebUI API 路由
 *
 * 使用 getNoAuth / postNoAuth：页面嵌入 NapCat WebUI 扩展页时调用。
 * 危险写操作在配置层有开关保护。
 */

import type {
  NapCatPluginContext,
  PluginHttpRequest,
  PluginHttpResponse,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import * as contact from './contact-service';
import type { PluginConfig } from '../types';

function bodyOf(req: PluginHttpRequest): Record<string, unknown> {
  return (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
}

function asIdArray(v: unknown): Array<string | number> {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x !== null && x !== undefined && String(x).length > 0);
}

function ok(res: PluginHttpResponse, data?: unknown, message = 'ok'): void {
  res.json({ code: 0, message, data });
}

function fail(res: PluginHttpResponse, message: string, status = 400): void {
  res.status(status).json({ code: -1, message });
}

export function registerApiRoutes(ctx: NapCatPluginContext): void {
  const router = ctx.router;

  // ---------- 状态 / 配置 ----------

  router.getNoAuth('/status', (_req, res) => {
    ok(res, {
      pluginName: ctx.pluginName,
      uptime: pluginState.getUptime(),
      uptimeFormatted: pluginState.getUptimeFormatted(),
      selfId: pluginState.selfId,
      selfNickname: pluginState.selfNickname,
      config: pluginState.config,
      stats: pluginState.stats,
    });
  });

  router.getNoAuth('/config', (_req, res) => {
    ok(res, pluginState.config);
  });

  router.postNoAuth('/config', (req, res) => {
    try {
      const body = bodyOf(req);
      pluginState.updateConfig(body as Partial<PluginConfig>);
      ctx.logger.info('配置已保存');
      ok(res, pluginState.config);
    } catch (e) {
      fail(res, String(e), 500);
    }
  });

  router.getNoAuth('/login', async (_req, res) => {
    try {
      const info = await contact.getLoginInfo();
      ok(res, info);
    } catch (e) {
      fail(res, String(e), 500);
    }
  });

  // ---------- 好友 ----------

  router.getNoAuth('/friends', async (_req, res) => {
    try {
      const categories = await contact.listFriendsWithCategory();
      ok(res, categories);
    } catch (e) {
      ctx.logger.error('获取好友分组列表失败:', e);
      fail(res, String(e), 500);
    }
  });

  router.getNoAuth('/friends/flat', async (_req, res) => {
    try {
      const list = await contact.listFriendsFlat();
      ok(res, list);
    } catch (e) {
      fail(res, String(e), 500);
    }
  });

  router.getNoAuth('/friends/probe', async (req, res) => {
    try {
      const userId = String(req.query?.user_id ?? req.query?.uin ?? '').trim();
      if (!userId) return fail(res, '需要 query: user_id');
      const data = await contact.probeFriend(userId);
      ok(res, data);
    } catch (e) {
      fail(res, String(e), 500);
    }
  });

  router.postNoAuth('/friends/delete', async (req, res) => {
    try {
      const body = bodyOf(req);
      const userIds = asIdArray(body.user_ids ?? body.userIds);
      if (userIds.length === 0) return fail(res, 'user_ids 不能为空');

      ctx.logger.info(`批量删除好友开始: count=${userIds.length} ids=${userIds.slice(0, 5).join(',')}${userIds.length > 5 ? '...' : ''}`);

      const result = await contact.batchDeleteFriends(userIds, {
        temp_block: typeof body.temp_block === 'boolean' ? body.temp_block : undefined,
        temp_both_del: typeof body.temp_both_del === 'boolean' ? body.temp_both_del : undefined,
      });
      ctx.logger.info(`批量删除好友完成: success=${result.success} failed=${result.failed}`);
      if (result.failed > 0) {
        const sample = result.results.filter((r) => !r.ok).slice(0, 3);
        ctx.logger.warn('删除失败样例:', JSON.stringify(sample));
      }
      ok(res, result);
    } catch (e) {
      ctx.logger.error('批量删除好友异常:', e);
      fail(res, String(e), 500);
    }
  });

  router.postNoAuth('/friends/move-category', async (req, res) => {
    try {
      const body = bodyOf(req);
      const userIds = asIdArray(body.user_ids ?? body.userIds);
      const categoryId = Number(body.category_id ?? body.categoryId);
      if (userIds.length === 0) return fail(res, 'user_ids 不能为空');
      if (!Number.isFinite(categoryId)) return fail(res, 'category_id 无效');

      const result = await contact.batchMoveCategory(ctx, userIds, categoryId);
      ctx.logger.info(`批量移动分组完成: success=${result.success} failed=${result.failed}`);
      ok(res, result);
    } catch (e) {
      fail(res, String(e), 500);
    }
  });

  router.postNoAuth('/friends/remark', async (req, res) => {
    try {
      const body = bodyOf(req);
      // 单条
      if (body.user_id !== undefined && body.remark !== undefined) {
        await contact.setFriendRemark(body.user_id as string | number, String(body.remark));
        pluginState.increment('remarksSet', 1);
        return ok(res, { id: body.user_id, ok: true });
      }
      // 批量
      const items = body.items;
      if (!Array.isArray(items)) return fail(res, '需要 user_id+remark 或 items[]');
      const mapped = items.map((it: any) => ({
        user_id: it.user_id,
        remark: String(it.remark ?? ''),
      }));
      const result = await contact.batchSetFriendRemarks(mapped);
      ok(res, result);
    } catch (e) {
      fail(res, String(e), 500);
    }
  });

  router.postNoAuth('/friends/category/create', async (req, res) => {
    try {
      const body = bodyOf(req);
      const name = String(body.name ?? '').trim();
      if (!name) return fail(res, 'name 不能为空');
      await contact.createFriendCategory(ctx, name);
      ok(res, { name });
    } catch (e) {
      fail(res, String(e), 500);
    }
  });

  router.postNoAuth('/friends/category/rename', async (req, res) => {
    try {
      const body = bodyOf(req);
      const oldName = String(body.old_name ?? body.oldName ?? '').trim();
      const newName = String(body.new_name ?? body.newName ?? '').trim();
      if (!oldName || !newName) return fail(res, 'old_name / new_name 不能为空');
      await contact.renameFriendCategory(ctx, oldName, newName);
      ok(res, { oldName, newName });
    } catch (e) {
      fail(res, String(e), 500);
    }
  });

  /**
   * 删除好友分组
   * body: {
   *   category_id, category_name,
   *   member_action: 'move' | 'delete',
   *   target_category_id?: number,  // move 时必填
   *   friend_uins?: (string|number)[]
   * }
   */
  router.postNoAuth('/friends/category/delete', async (req, res) => {
    try {
      const body = bodyOf(req);
      const categoryId = Number(body.category_id ?? body.categoryId);
      const categoryName = String(body.category_name ?? body.categoryName ?? '').trim();
      const memberAction = String(body.member_action ?? body.memberAction ?? '').trim() as 'move' | 'delete';
      const targetCategoryId = body.target_category_id ?? body.targetCategoryId;
      const friendUins = asIdArray(body.friend_uins ?? body.friendUins ?? body.user_ids ?? body.userIds);

      if (!Number.isFinite(categoryId)) return fail(res, 'category_id 无效');
      if (!categoryName) return fail(res, 'category_name 不能为空');
      if (memberAction !== 'move' && memberAction !== 'delete') {
        return fail(res, "member_action 必须是 'move' 或 'delete'");
      }
      if (memberAction === 'move' && !Number.isFinite(Number(targetCategoryId))) {
        return fail(res, 'move 模式需要 target_category_id');
      }

      ctx.logger.info(
        `删除分组开始: id=${categoryId} name=${categoryName} action=${memberAction} members=${friendUins.length}`
      );

      const data = await contact.deleteFriendCategory(ctx, {
        categoryId,
        categoryName,
        memberAction,
        targetCategoryId: targetCategoryId !== undefined ? Number(targetCategoryId) : undefined,
        friendUins,
      });

      ctx.logger.info(
        `删除分组完成: deleted=${data.categoryDeleted} member_ok=${data.memberResult.success} member_fail=${data.memberResult.failed}`
      );
      ok(res, data);
    } catch (e) {
      ctx.logger.error('删除分组失败:', e);
      fail(res, String(e), 500);
    }
  });

  // ---------- 群聊 ----------

  router.getNoAuth('/groups', async (_req, res) => {
    try {
      const groups = await contact.listGroups(true);
      ok(res, groups);
    } catch (e) {
      ctx.logger.error('获取群列表失败:', e);
      fail(res, String(e), 500);
    }
  });

  router.postNoAuth('/groups/leave', async (req, res) => {
    try {
      const body = bodyOf(req);
      const groupIds = asIdArray(body.group_ids ?? body.groupIds);
      if (groupIds.length === 0) return fail(res, 'group_ids 不能为空');

      const result = await contact.batchLeaveGroups(groupIds);
      ctx.logger.info(`批量退群完成: success=${result.success} failed=${result.failed}`);
      ok(res, result);
    } catch (e) {
      fail(res, String(e), 500);
    }
  });

  router.postNoAuth('/groups/remark', async (req, res) => {
    try {
      const body = bodyOf(req);
      const groupId = body.group_id ?? body.groupId;
      const remark = String(body.remark ?? '');
      if (groupId === undefined || groupId === null) return fail(res, 'group_id 不能为空');
      await contact.setGroupRemark(groupId as string | number, remark);
      pluginState.increment('remarksSet', 1);
      ok(res, { group_id: groupId, remark });
    } catch (e) {
      fail(res, String(e), 500);
    }
  });

  ctx.logger.debug('API 路由注册完成');
}
