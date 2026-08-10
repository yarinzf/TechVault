// The AI chat widget (mounted globally in CustomerLayout) is the app's one
// real support surface — no separate /contact route exists. This lets any
// page open it without importing the widget itself.
export function openSupportChat() {
  window.dispatchEvent(new CustomEvent('techvault:open-support-chat'));
}
