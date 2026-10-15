// Release fetches accept immutable commits over HTTPS only.
export function fullCommit(ref) {
  return typeof ref === "string" && ref.length === 40
    && [...ref].every(c => "0123456789abcdefABCDEF".includes(c));
}
export function releaseGitSource(repo, ref) {
  if (!fullCommit(ref)) {
    throw new Error("release source requires a full 40-hex commit SHA");
  }
  let url;
  try { url = new URL(repo); } catch { throw new Error("release source requires an https:// repository"); }
  if (typeof repo !== "string" || !repo.startsWith("https://") || url.protocol !== "https:"
    || !url.hostname || url.username || url.password) throw new Error("release source requires an https:// repository");
}
export const releaseGitConfig = ["-c", "protocol.allow=never", "-c", "protocol.https.allow=always"];
