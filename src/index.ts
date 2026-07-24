/**
 * napcat-plugin-contact-manager
 * 批量管理好友 / 群聊（列表、删除、退群、分组、备注）
 *
 * @license MIT
 */

import type {
  PluginModule,
  PluginConfigSchema,
  NapCatPluginContext,
} from 'napcat-types/napcat-onebot/network/plugin/types';

import { buildConfigSchema } from './config';
import { pluginState } from './core/state';
import { registerApiRoutes } from './services/api-service';
import type { PluginConfig } from './types';

export let plugin_config_ui: PluginConfigSchema = [];

export const plugin_init: PluginModule['plugin_init'] = async (ctx) => {
  try {
    pluginState.init(ctx);
    ctx.logger.info('联系人批量管理插件初始化中...');

    plugin_config_ui = buildConfigSchema(ctx);
    registerWebUI(ctx);
    registerApiRoutes(ctx);

    ctx.logger.info('联系人批量管理插件初始化完成');
    ctx.logger.info(`  扩展页面: /plugin/${ctx.pluginName}/page/manager`);
    ctx.logger.info(`  API 前缀: /plugin/${ctx.pluginName}/api/`);
  } catch (error) {
    ctx.logger.error('插件初始化失败:', error);
    throw error;
  }
};

export const plugin_cleanup: PluginModule['plugin_cleanup'] = async (ctx) => {
  try {
    pluginState.cleanup();
    ctx.logger.info('联系人批量管理插件已卸载');
  } catch (e) {
    ctx.logger.warn('插件卸载时出错:', e);
  }
};

export const plugin_get_config: PluginModule['plugin_get_config'] = async () => {
  return pluginState.config;
};

export const plugin_set_config: PluginModule['plugin_set_config'] = async (ctx, config) => {
  pluginState.replaceConfig(config as PluginConfig);
  ctx.logger.info('配置已通过 WebUI 更新');
};

export const plugin_on_config_change: PluginModule['plugin_on_config_change'] = async (
  ctx,
  _ui,
  key,
  value
) => {
  try {
    pluginState.updateConfig({ [key]: value } as Partial<PluginConfig>);
    ctx.logger.debug(`配置项 ${key} 已更新`);
  } catch (err) {
    ctx.logger.error(`更新配置项 ${key} 失败:`, err);
  }
};

function registerWebUI(ctx: NapCatPluginContext): void {
  const router = ctx.router;
  router.static('/static', 'webui');
  router.page({
    path: 'manager',
    title: '批量管理',
    htmlFile: 'webui/index.html',
    description: '批量管理好友与群聊：删除、退群、移动分组、备注',
  });
}
