// Runs before the document body and the module bundle, including in WebView2.
try {
  const saved = localStorage.getItem('cinna-fancon-theme');
  const mode = saved === 'light' || saved === 'dark'
    ? saved
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
} catch {
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light';
}
