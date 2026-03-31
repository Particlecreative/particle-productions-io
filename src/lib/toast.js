/**
 * Lightweight toast notification system.
 * Uses window events so any module can call toast.success() without React context.
 *
 * Usage:
 *   import { toast } from '../lib/toast';
 *   toast.success('Saved!');
 *   toast.error('Something went wrong');
 *   toast.warning('Check your input');
 *   toast.info('Processing...');
 */

function emit(type, message, duration = 3500) {
  window.dispatchEvent(new CustomEvent('cp-toast', { detail: { type, message, duration, id: Date.now() + Math.random() } }));
}

export const toast = {
  success: (msg, duration)  => emit('success', msg, duration),
  error:   (msg, duration)  => emit('error',   msg, duration ?? 5000),
  warning: (msg, duration)  => emit('warning', msg, duration),
  info:    (msg, duration)  => emit('info',    msg, duration),
};
