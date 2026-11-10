import type { Plan } from '@api-types';
import type { Locale } from '@shared/protocol';
import { useEffect, useState } from 'preact/hooks';
import { rpc } from '../rpc/rpcClient';
import { SERVER_RU_TRANSLATION_GAPS } from './serverTranslationGaps';

export interface ModuleMessages {
  readonly en: Readonly<Record<string, string>>;
  readonly ru: Readonly<Record<string, string>>;
}

export interface PhaseName {
  readonly id: string;
  readonly name: string;
}

type Params = Readonly<Record<string, string | number>>;

const EXECUTION_STEP_PATTERN = /^3\.(\d+)\.(\d+)$/;
const EXECUTION_GROUP_PATTERN = /^3\.(\d+)$/;
const PHASE_NAME_KEYS: Readonly<Record<string, string>> = {
  '0': 'phase.init',
  '1.0': 'phase.assessment',
  '1.1': 'phase.research',
  '1.2': 'phase.proving',
  '1.3': 'phase.impactAnalysis',
  '1.4': 'phase.preplanningReview',
  '2.0': 'phase.planning',
  '2.1': 'phase.planReview',
  '4.0': 'phase.agenticReview',
  '4.1': 'phase.addressFix',
  '4.2': 'phase.finalApproval',
  '5.1': 'phase.reflection',
  '5.2': 'phase.manualImplementation',
  '6': 'phase.done',
};
const EXECUTION_STEP_NAME_KEYS: readonly string[] = ['phase.implementation', 'phase.validation', 'phase.fixes', 'vsc.phase.commitApproval', 'phase.commit'];

let activeLocale: Locale = 'en';
let serverMessages: Readonly<Record<string, string>> = {};
const moduleMessages: ModuleMessages[] = [];
const changeListeners = new Set<() => void>();
let messagesVersion = 0;
let latestLocaleRequest = 0;

export function t(key: string, params?: Params): string {
  const message = lookup(key);
  return message === undefined ? key : interpolate(message, params);
}

export function useT(): typeof t {
  const [, setRenderedVersion] = useState(messagesVersion);
  useEffect(() => {
    const listener = (): void => setRenderedVersion(messagesVersion);
    changeListeners.add(listener);
    // Messages that loaded between render and this effect would otherwise never reach the component.
    listener();
    return () => {
      changeListeners.delete(listener);
    };
  }, []);
  return t;
}

export function currentLocale(): Locale {
  return activeLocale;
}

export function setServerMessages(locale: Locale, messages: Record<string, string>): void {
  activeLocale = locale;
  serverMessages = messages;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
  notifyChange();
}

export function registerModuleMessages(m: ModuleMessages): void {
  if (!moduleMessages.includes(m)) {
    moduleMessages.push(m);
    notifyChange();
  }
}

// Overlapping switches (user pick, server echo, bootstrap) resolve out of order; only the newest request may apply.
export async function loadLocaleMessages(locale: Locale): Promise<boolean> {
  latestLocaleRequest += 1;
  const request = latestLocaleRequest;
  const messages = await rpc.call('i18n.load', { locale });
  if (request !== latestLocaleRequest) {
    return false;
  }
  setServerMessages(locale, messages);
  return true;
}

// D8: names come from server i18n keys (mirroring the web's PHASE_NAMES) or the server phase registry; ids are the last resort.
export function phaseLabel(phase: string, plan: Plan | undefined, available?: readonly PhaseName[]): string {
  const named = translatedName(PHASE_NAME_KEYS[phase]) ?? registryName(phase, available);
  if (named !== undefined) {
    return named;
  }
  const step = EXECUTION_STEP_PATTERN.exec(phase);
  if (step !== null) {
    return executionStepLabel(step[1], step[2], plan, available);
  }
  const group = EXECUTION_GROUP_PATTERN.exec(phase);
  return group === null ? phase : executionGroupName(group[1], plan) ?? phase;
}

function executionStepLabel(group: string, step: string, plan: Plan | undefined, available?: readonly PhaseName[]): string {
  const groupName = executionGroupName(group, plan) ?? `3.${group}`;
  const stepName = translatedName(EXECUTION_STEP_NAME_KEYS[Number(step)]) ?? registryName(`3.x.${step}`, available) ?? step;
  return lookup('phase.subPhaseName') === undefined
    ? `${groupName}: ${stepName}`
    : t('phase.subPhaseName', { groupName, step: stepName });
}

function translatedName(key: string | undefined): string | undefined {
  return key === undefined || lookup(key) === undefined ? undefined : t(key);
}

function registryName(phase: string, available: readonly PhaseName[] | undefined): string | undefined {
  return available?.find((entry) => entry.id === phase)?.name;
}

function executionGroupName(group: string, plan: Plan | undefined): string | undefined {
  return plan?.execution?.find((item) => item.id === `3.${group}`)?.name;
}

function lookup(key: string): string | undefined {
  return serverMessage(key)
    ?? findModuleMessage((messages) => messages[activeLocale][key])
    ?? findModuleMessage((messages) => messages.en[key]);
}

function serverMessage(key: string): string | undefined {
  const message = serverMessages[key];
  const gap = SERVER_RU_TRANSLATION_GAPS[key];
  return activeLocale === 'ru' && gap !== undefined && message === gap.untranslated ? gap.ru : message;
}

function findModuleMessage(read: (messages: ModuleMessages) => string | undefined): string | undefined {
  for (const messages of moduleMessages) {
    const message = read(messages);
    if (message !== undefined) {
      return message;
    }
  }
  return undefined;
}

function interpolate(message: string, params: Params | undefined): string {
  if (params === undefined) {
    return message;
  }
  return message.replace(/\{(\w+)\}/g, (match, name: string) => (params[name] === undefined ? match : String(params[name])));
}

function notifyChange(): void {
  messagesVersion += 1;
  changeListeners.forEach((listener) => listener());
}
