import type { ModuleMessages } from '../types';

export const PHASE_MESSAGES: ModuleMessages = {
  en: {
    'vsc.phase.history': 'Phase history',
    'vsc.phase.gateWaiting': 'Waiting for your decision',
    'vsc.phase.forceConfirm': 'The workspace is at phase {phase}, not 4.0. Start the review pipeline anyway? This may consume API tokens.',
  },
  ru: {
    'vsc.phase.history': 'История фаз',
    'vsc.phase.gateWaiting': 'Ожидается ваше решение',
    'vsc.phase.forceConfirm': 'Рабочая область находится на фазе {phase}, а не 4.0. Всё равно запустить конвейер ревью? Это может расходовать токены API.',
  },
};
