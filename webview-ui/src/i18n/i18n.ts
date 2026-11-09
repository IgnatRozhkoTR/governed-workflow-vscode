import type { Plan } from '@api-types';
import type { Locale } from '@shared/protocol';
import { useEffect, useState } from 'preact/hooks';
import { rpc } from '../rpc/rpcClient';

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

let activeLocale: Locale = 'en';
let serverMessages: Readonly<Record<string, string>> = {};
const moduleMessages: ModuleMessages[] = [];
const changeListeners = new Set<() => void>();

export function t(key: string, params?: Params): string {
  const message = lookup(key);
  return message === undefined ? key : interpolate(message, params);
}

export function useT(): typeof t {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = (): void => setVersion((version) => version + 1);
    changeListeners.add(listener);
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
  notifyChange();
}

export function registerModuleMessages(m: ModuleMessages): void {
  if (!moduleMessages.includes(m)) {
    moduleMessages.push(m);
    notifyChange();
  }
}

export async function loadLocaleMessages(locale: Locale): Promise<void> {
  setServerMessages(locale, await rpc.call('i18n.load', { locale }));
}

// D8: labels come only from server data (phase registry names, plan sub-phase names, server i18n templates).
export function phaseLabel(phase: string, plan: Plan | undefined, available?: readonly PhaseName[]): string {
  const registered = available?.find((entry) => entry.id === phase);
  if (registered !== undefined) {
    return registered.name;
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
  const stepName = available?.find((entry) => entry.id === `3.x.${step}`)?.name ?? step;
  return lookup('phase.subPhaseName') === undefined
    ? `${groupName}: ${stepName}`
    : t('phase.subPhaseName', { groupName, step: stepName });
}

function executionGroupName(group: string, plan: Plan | undefined): string | undefined {
  return plan?.execution?.find((item) => item.id === `3.${group}`)?.name;
}

function lookup(key: string): string | undefined {
  return serverMessages[key]
    ?? findModuleMessage((messages) => messages[activeLocale][key])
    ?? findModuleMessage((messages) => messages.en[key]);
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
  changeListeners.forEach((listener) => listener());
}
