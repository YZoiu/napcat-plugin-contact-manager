/**
 * 插件配置：默认值与 WebUI Schema
 */

import type { NapCatPluginContext, PluginConfigSchema } from 'napcat-types/napcat-onebot/network/plugin/types';
import type { PluginConfig } from './types';

export const DEFAULT_CONFIG: PluginConfig = {
  enabled: true,
  debug: false,
  allowBatchDeleteFriend: true,
  allowBatchLeaveGroup: true,
  allowBatchMoveCategory: true,
  requireConfirm: true,
  operationDelayMs: 300,
  deleteFriendBlock: false,
  deleteFriendBothDel: false,
};

export function buildConfigSchema(ctx: NapCatPluginContext): PluginConfigSchema {
  return ctx.NapCatConfig.combine(
    ctx.NapCatConfig.html(`
      <div style="padding: 16px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px; margin-bottom: 16px; color: white;">
        <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 600;">联系人批量管理</h3>
        <p style="margin: 0; font-size: 13px; opacity: 0.9;">批量管理好友与群聊：删除、退群、移动分组、备注等</p>
      </div>
    `),
    ctx.NapCatConfig.boolean('enabled', '启用插件', true, '关闭后插件 API 仍可读列表，但拒绝写操作'),
    ctx.NapCatConfig.boolean('debug', '调试模式', false, '输出详细操作日志'),
    ctx.NapCatConfig.boolean(
      'allowBatchDeleteFriend',
      '允许批量删除好友',
      true,
      '关闭后「批量删除好友」接口将返回拒绝'
    ),
    ctx.NapCatConfig.boolean(
      'allowBatchLeaveGroup',
      '允许批量退群',
      true,
      '关闭后「批量退群」接口将返回拒绝'
    ),
    ctx.NapCatConfig.boolean(
      'allowBatchMoveCategory',
      '允许批量移动分组',
      true,
      '关闭后「批量移动好友分组」接口将返回拒绝（依赖 NT 底层 BuddyService）'
    ),
    ctx.NapCatConfig.boolean(
      'requireConfirm',
      '前端二次确认提示',
      true,
      'WebUI 危险操作前弹出确认框（推荐开启）'
    ),
    ctx.NapCatConfig.number(
      'operationDelayMs',
      '批量操作间隔(ms)',
      300,
      '每条操作之间的等待时间，建议 200–500，降低限流风险'
    ),
    ctx.NapCatConfig.boolean(
      'deleteFriendBlock',
      '删除好友时拉黑',
      false,
      '调用 delete_friend 时设置 temp_block'
    ),
    ctx.NapCatConfig.boolean(
      'deleteFriendBothDel',
      '删除好友时双向删除',
      false,
      '调用 delete_friend 时设置 temp_both_del'
    )
  );
}
