export type NotifyKind = 'comments' | 'go';

// Exact texts of the web Notify dropdown (frontend/js/app.js doNotify) so Claude receives the same prompts.
export const NOTIFY_MESSAGES: Readonly<Record<NotifyKind, string>> = {
  comments: 'I left review comments for you to address. Check workspace_get_comments for details.',
  go: 'You can proceed. Continue with the current task.',
};
