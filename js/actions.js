// Every write goes through here: queue op(s) in the outbox, haptic tick, snackbar with Undo.
import { store } from './store.js';
import { undoMs } from './env.js';
import { snackbar } from './ui/dom.js';
import { haptic } from './platform.js';

// steps: [[action, body], ...] — queued in order, undone together.
export function write(steps, msg, kind = 'tick') {
  const ops = steps.map(([action, body]) => store.queue(action, body));
  haptic(kind);
  snackbar(msg, {
    action: 'Undo',
    ms: undoMs,
    onAction: () => {
      const undone = ops.slice().reverse().map(op => store.outbox.cancel(op.opId));
      store.emit();
      snackbar(undone.every(Boolean) ? 'Undone' : 'Too late — already saved');
    },
  });
  return ops;
}
