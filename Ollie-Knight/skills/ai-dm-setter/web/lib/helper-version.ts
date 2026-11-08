/** The newest Chrome helper. Bump together with extension/manifest.json. */
export const HELPER_VERSION = "0.3.12";

/** True when version a is older than version b ("0.3.3" < "0.3.6"). */
export const olderVersion = (a: string, b: string) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
};
