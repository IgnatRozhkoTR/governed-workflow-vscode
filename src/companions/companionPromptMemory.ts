import type * as vscode from 'vscode';
import type { CompanionTrigger } from './companionRegistry';

const DECLINED_COMPANIONS_KEY = 'governedWorkflow.declinedCompanions';

export class CompanionPromptMemory {
  private readonly promptedThisSession = new Set<string>();

  constructor(private readonly globalState: vscode.Memento) {}

  shouldPrompt(companionId: string, trigger: CompanionTrigger): boolean {
    if (trigger === 'command') {
      return true;
    }
    return !this.isDeclined(companionId) && !this.promptedThisSession.has(sessionKey(companionId, trigger));
  }

  markPrompted(companionId: string, trigger: CompanionTrigger): void {
    this.promptedThisSession.add(sessionKey(companionId, trigger));
  }

  isDeclined(companionId: string): boolean {
    return this.declinedIds().includes(companionId);
  }

  decline(companionId: string): Thenable<void> {
    const declined = this.declinedIds();
    return declined.includes(companionId) ? Promise.resolve() : this.globalState.update(DECLINED_COMPANIONS_KEY, [...declined, companionId]);
  }

  private declinedIds(): string[] {
    const stored = this.globalState.get<unknown>(DECLINED_COMPANIONS_KEY);
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  }
}

function sessionKey(companionId: string, trigger: CompanionTrigger): string {
  return `${companionId}:${trigger}`;
}
