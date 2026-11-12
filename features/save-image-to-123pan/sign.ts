// Port of the 123pan web client's request signature (see alist drivers/123/util.go `signPath`).

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(text: string): number {
  const bytes = new TextEncoder().encode(text);
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const DIGIT_MAP = 'adefghlmyijnopkqrstubcvwsz';

/** Returns the `[key, value]` query pair the 123pan API expects. */
export function signPath(path: string, os = 'web', version = '3', now = new Date()): [string, string] {
  const timestamp = Math.floor(now.getTime() / 1000).toString();
  const random = Math.round(1e7 * Math.random()).toString();
  // Server time is evaluated in China Standard Time (UTC+8).
  const cst = new Date(now.getTime() + 8 * 3600 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const nowStr =
    cst.getUTCFullYear().toString() +
    pad(cst.getUTCMonth() + 1) +
    pad(cst.getUTCDate()) +
    pad(cst.getUTCHours()) +
    pad(cst.getUTCMinutes());
  const mapped = [...nowStr].map((d) => DIGIT_MAP[Number(d)]).join('');
  const timeSign = crc32(mapped).toString();
  const dataSign = crc32([timestamp, random, path, os, version, timeSign].join('|')).toString();
  return [timeSign, `${timestamp}-${random}-${dataSign}`];
}
