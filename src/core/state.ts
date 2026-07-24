/**
 * 全局状态管理（单例）
 */

import fs from 'fs';
import path from 'path';
import type { NapCatPluginContext, PluginLogger } from 'napcat-types/napcat-onebot/network/plugin/types';
import { DEFAULT_CONFIG } from '../config';
import type { PluginConfig } from '../types';

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function sanitizeConfig(raw: unknown): PluginConfig {
  if (!isObject(raw)) return { ...DEFAULT_CONFIG };

  const out: PluginConfig = { ...DEFAULT_CONFIG };

  if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
  if (typeof raw.debug === 'boolean') out.debug = raw.debug;
  if (typeof raw.allowBatchDeleteFriend === 'boolean') out.allowBatchDeleteFriend = raw.allowBatchDeleteFriend;
  if (typeof raw.allowBatchLeaveGroup === 'boolean') out.allowBatchLeaveGroup = raw.allowBatchLeaveGroup;
  if (typeof raw.allowBatchMoveCategory === 'boolean') out.allowBatchMoveCategory = raw.allowBatchMoveCategory;
  if (typeof raw.requireConfirm === 'boolean') out.requireConfirm = raw.requireConfirm;
  if (typeof raw.operationDelayMs === 'number' && Number.isFinite(raw.operationDelayMs)) {
    out.operationDelayMs = Math.max(0, Math.min(10_000, Math.floor(raw.operationDelayMs)));
  }
  if (typeof raw.deleteFriendBlock === 'boolean') out.deleteFriendBlock = raw.deleteFriendBlock;
  if (typeof raw.deleteFriendBothDel === 'boolean') out.deleteFriendBothDel = raw.deleteFriendBothDel;

  return out;
}

class PluginState {
  private _ctx: NapCatPluginContext | null = null;
  config: PluginConfig = { ...DEFAULT_CONFIG };
  startTime = 0;
  selfId = '';
  selfNickname = '';

  stats = {
    processed: 0,
    todayProcessed: 0,
    lastUpdateDay: new Date().toDateString(),
    friendsDeleted: 0,
    groupsLeft: 0,
    categoriesMoved: 0,
    remarksSet: 0,
  };

  get ctx(): NapCatPluginContext {
    if (!this._ctx) throw new Error('PluginState 尚未初始化');
    return this._ctx;
  }

  get logger(): PluginLogger {
    return this.ctx.logger;
  }

  init(ctx: NapCatPluginContext): void {
    this._ctx = ctx;
    this.startTime = Date.now();
    this.loadConfig();
    this.ensureDataDir();
    void this.fetchSelfId();
  }

  private async fetchSelfId(): Promise<void> {
    try {
      const res = (await this.ctx.actions.call(
        'get_login_info',
        {},
        this.ctx.adapterName,
        this.ctx.pluginManager.config
      )) as { user_id?: number | string; nickname?: string };
      if (res?.user_id) this.selfId = String(res.user_id);
      if (res?.nickname) this.selfNickname = String(res.nickname);
      this.logDebug(`登录账号: ${this.selfNickname} (${this.selfId})`);
    } catch (e) {
      this.logger.warn('获取登录信息失败:', e);
    }
  }

  cleanup(): void {
    this.saveConfig();
    this._ctx = null;
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.ctx.dataPath)) {
      fs.mkdirSync(this.ctx.dataPath, { recursive: true });
    }
  }

  getDataFilePath(filename: string): string {
    return path.join(this.ctx.dataPath, filename);
  }

  loadConfig(): void {
    const configPath = this.ctx.configPath;
    try {
      if (configPath && fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        this.config = sanitizeConfig(raw);
        if (isObject(raw) && isObject(raw.stats)) {
          Object.assign(this.stats, raw.stats);
        }
      } else {
        this.config = { ...DEFAULT_CONFIG };
        this.saveConfig();
      }
    } catch (error) {
      this.ctx.logger.error('加载配置失败，使用默认配置:', error);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  saveConfig(): void {
    if (!this._ctx) return;
    try {
      const configDir = path.dirname(this._ctx.configPath);
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
      const data = { ...this.config, stats: this.stats };
      fs.writeFileSync(this._ctx.configPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      this._ctx.logger.error('保存配置失败:', error);
    }
  }

  updateConfig(partial: Partial<PluginConfig>): void {
    this.config = sanitizeConfig({ ...this.config, ...partial });
    this.saveConfig();
  }

  replaceConfig(config: PluginConfig): void {
    this.config = sanitizeConfig(config);
    this.saveConfig();
  }

  increment(kind: 'friendsDeleted' | 'groupsLeft' | 'categoriesMoved' | 'remarksSet', n = 1): void {
    const today = new Date().toDateString();
    if (this.stats.lastUpdateDay !== today) {
      this.stats.todayProcessed = 0;
      this.stats.lastUpdateDay = today;
    }
    this.stats.todayProcessed += n;
    this.stats.processed += n;
    this.stats[kind] += n;
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }

  getUptimeFormatted(): string {
    const ms = this.getUptime();
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}天${h % 24}小时`;
    if (h > 0) return `${h}小时${m % 60}分钟`;
    if (m > 0) return `${m}分钟${s % 60}秒`;
    return `${s}秒`;
  }

  logDebug(...args: unknown[]): void {
    if (this.config.debug) this.logger.debug(...args);
  }

  /**
   * 调用 OneBot Action
   * 注意：官方 actions.call 在 data 为 null/undefined 时会误报失败（如 delete_friend），
   * 这里改为直接 handle，并兼容 valid:false 业务错误。
   */
  async callApi<T = unknown>(action: string, params: unknown = {}): Promise<T> {
    const handler = this.ctx.actions.get(action as never) as
      | { handle: (p: unknown, adapter: string, config: unknown) => Promise<{
        status: string;
        message?: string;
        data?: unknown;
      }>; }
      | undefined;

    if (!handler?.handle) {
      // 兜底：仍走 call（部分环境 get 签名不同）
      return (await this.ctx.actions.call(
        action as never,
        params,
        this.ctx.adapterName,
        this.ctx.pluginManager.config
      )) as T;
    }

    const result = await handler.handle(
      params,
      this.ctx.adapterName,
      this.ctx.pluginManager.config
    );

    if (result.status !== 'ok') {
      throw new Error(result.message || `Action ${action} failed`);
    }

    const data = result.data as any;
    if (data && typeof data === 'object' && data.valid === false) {
      throw new Error(String(data.message || '操作失败'));
    }

    return data as T;
  }

  sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

export const pluginState = new PluginState();
