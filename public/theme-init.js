// Apply the saved theme before first paint to avoid a flash of the wrong theme.
// Kept as a static file (not inline) so the Content-Security-Policy can use script-src 'self'.
try {
  var t = localStorage.getItem('gradpath-theme') || 'system'
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
} catch (e) {
  /* storage unavailable: fall back to light theme */
}
