/**
 * Shared status color mappings used across the app.
 * Keeps status badge colors consistent everywhere.
 */

export const STATUS_BADGE = {
  // Invoice / payment
  'Paid':           'bg-green-100 text-green-700 border-green-200',
  'Pending':        'bg-amber-100 text-amber-700 border-amber-200',
  'Partially Paid': 'bg-blue-100 text-blue-700 border-blue-200',
  'Overdue':        'bg-red-100 text-red-700 border-red-200',
  'Cancelled':      'bg-gray-100 text-gray-400 border-gray-200',
  // Contract
  'Running':        'bg-green-100 text-green-700 border-green-200',
  'Close to Overdue': 'bg-orange-100 text-orange-700 border-orange-200',
  'Done':           'bg-gray-100 text-gray-500 border-gray-200',
  // Script
  'draft':          'bg-gray-100 text-gray-600 border-gray-200',
  'review':         'bg-amber-100 text-amber-700 border-amber-200',
  'approved':       'bg-green-100 text-green-700 border-green-200',
  'archived':       'bg-gray-100 text-gray-400 border-gray-200',
};

export function statusBadgeClass(status) {
  return STATUS_BADGE[status] || 'bg-gray-100 text-gray-500 border-gray-200';
}
