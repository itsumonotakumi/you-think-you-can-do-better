// 送信された記録の形を検査する（点数のフィールドは受け取らない）
import type { PlayMode, PlaySubmission, RoleId } from '../../src/engine/types';
import { ROLES } from '../../src/engine/types';
import { isDeleteKey } from './deletion';

export const MAX_CHOICES = 200;
export const MAX_DRAFTS = 100;
export const MAX_PRESS = 50;
export const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const MODES: readonly PlayMode[] = ['normal', 'hard'];

/** 削除用の鍵は任意。付いていればハッシュにして保存する */
export interface ParsedSubmission extends PlaySubmission {
  deleteKey?: string;
}

export type ParseResult =
  | { ok: true; value: ParsedSubmission }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value);
}

function isRole(value: unknown): value is RoleId {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

function isMode(value: unknown): value is PlayMode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

export function parseSubmission(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, error: 'invalid_body' };

  const { scenarioId, scenarioVersion, role, mode, choices, drafts, press, nickname, clientId } = body;
  if (!isId(scenarioId)) return { ok: false, error: 'invalid_scenario' };
  if (typeof scenarioVersion !== 'string' || scenarioVersion.length > 32) {
    return { ok: false, error: 'invalid_scenario_version' };
  }
  if (!isRole(role)) return { ok: false, error: 'invalid_role' };
  if (!isMode(mode)) return { ok: false, error: 'invalid_mode' };
  if (typeof nickname !== 'string') return { ok: false, error: 'nickname_required' };
  if (typeof clientId !== 'string' || !CLIENT_ID_RE.test(clientId)) {
    return { ok: false, error: 'invalid_client_id' };
  }
  if (typeof body.turnstileToken !== 'string' || body.turnstileToken.length > 4096) {
    return { ok: false, error: 'invalid_turnstile_token' };
  }
  if (body.deleteKey !== undefined && !isDeleteKey(body.deleteKey)) {
    return { ok: false, error: 'invalid_delete_key' };
  }

  if (!Array.isArray(choices) || choices.length > MAX_CHOICES) {
    return { ok: false, error: 'invalid_choices' };
  }
  const parsedChoices: PlaySubmission['choices'] = [];
  for (const entry of choices) {
    if (!isRecord(entry) || !isId(entry.pointId) || !isId(entry.choiceId)) {
      return { ok: false, error: 'invalid_choices' };
    }
    parsedChoices.push({ pointId: entry.pointId, choiceId: entry.choiceId });
  }

  if (!Array.isArray(drafts) || drafts.length > MAX_DRAFTS) {
    return { ok: false, error: 'invalid_drafts' };
  }
  const parsedDrafts: PlaySubmission['drafts'] = [];
  for (const entry of drafts) {
    if (!isRecord(entry) || !isId(entry.draftKey) || !isId(entry.slotId) || !isId(entry.optionId)) {
      return { ok: false, error: 'invalid_drafts' };
    }
    parsedDrafts.push({ draftKey: entry.draftKey, slotId: entry.slotId, optionId: entry.optionId });
  }

  if (!Array.isArray(press) || press.length > MAX_PRESS) {
    return { ok: false, error: 'invalid_press' };
  }
  const parsedPress: PlaySubmission['press'] = [];
  for (const entry of press) {
    if (!isRecord(entry) || !isId(entry.questionId)) {
      return { ok: false, error: 'invalid_press' };
    }
    if (entry.answerId !== null && !isId(entry.answerId)) {
      return { ok: false, error: 'invalid_press' };
    }
    parsedPress.push({ questionId: entry.questionId, answerId: entry.answerId });
  }

  return {
    ok: true,
    value: {
      scenarioId,
      scenarioVersion,
      role,
      mode,
      choices: parsedChoices,
      drafts: parsedDrafts,
      press: parsedPress,
      nickname,
      clientId,
      turnstileToken: body.turnstileToken,
      ...(typeof body.deleteKey === 'string' ? { deleteKey: body.deleteKey } : {}),
    },
  };
}
