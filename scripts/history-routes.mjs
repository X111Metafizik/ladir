// Retain existing local report URLs after moving historical documents.
const names = new Set([
  "ARAZI_V13.md",
  "ARAZI_V14.md",
  "ARAZI_V18.html",
  "ARAZI_V19.html",
  "ATLAS_100_FPS_RAPORU_V22.html",
  "ATLAS_PERFORMANS_V23_INDIR.html",
  "BIYOMLAR.md",
  "OPTIMIZASYON.md",
  "PERFORMANS_V17.html",
  "PERFORMANS_V21.html",
  "PERFORMANS_V22.html",
  "PERFORMANS_V23.html",
  "PROJECT_HISTORY_TR.md",
  "TESLIM_RAPORU.md",
  "UCUS_V15.md",
  "UCUS_V16.md",
  "UCUS_V20.html",
  "UCUS_V24_INDIR.html",
  "UCUS_V24.html"
]);
export function historyRedirect(pathname) {
  const name = pathname.slice(1);
  return pathname.startsWith('/') && names.has(name) ? '/docs/history/' + name : null;
}
