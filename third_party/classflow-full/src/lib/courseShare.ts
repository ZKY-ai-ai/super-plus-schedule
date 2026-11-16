const PREFIX = "KEXUCOURSE1:";
const MAX_CODE_LENGTH = 200_000;

function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(input: string): string {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeCourseShare(text: string): string {
  return `${PREFIX}${toBase64(text)}`;
}

export function decodeCourseShare(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX) || trimmed.length > MAX_CODE_LENGTH) return null;
  try {
    const text = fromBase64(trimmed.slice(PREFIX.length)).trim();
    if (!text) return null;
    return text.slice(0, 300_000);
  } catch {
    return null;
  }
}

export function buildCourseShareLink(baseUrl: string, text: string): string {
  const base = baseUrl.split("#")[0];
  return `${base}#course=${encodeURIComponent(encodeCourseShare(text))}`;
}

/** Reads a `#course=` link and returns the importable timetable text. */
export function readCourseShareFromHash(hash: string): string | null {
  const match = hash.match(/(?:^#|[#&])course=([^&]+)/);
  if (!match) return null;
  let code = match[1];
  try {
    code = decodeURIComponent(code);
  } catch {
    return null;
  }
  return decodeCourseShare(code);
}
