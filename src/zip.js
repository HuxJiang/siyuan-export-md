/*
 * siyuan-export-md — 零依赖 ZIP（store 模式）
 * 由单文件 index.js 按功能拆分而来，业务代码保持原样。
 */
"use strict";

/* ------------------------------------------------------------------ *
 * 11. 零依赖 ZIP（store 模式）
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 4294967295;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 4294967295) >>> 0;
}

function dosTime(date) {
  const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | (Math.floor(date.getSeconds() / 2) & 31);
  const d = (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
  return { time, date: d };
}

function u16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function u32(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function concatChunks(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function buildZip(entries) {
  const encoder = new TextEncoder();
  const stamp = dosTime(new Date());
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const localHeader = concatChunks([
      u32(67324752),
      u16(20),
      u16(2048),
      u16(0),
      u16(stamp.time),
      u16(stamp.date),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0)
    ]);
    chunks.push(localHeader, nameBytes, entry.data);
    central.push(
      concatChunks([
        u32(33639248),
        u16(20),
        u16(20),
        u16(2048),
        u16(0),
        u16(stamp.time),
        u16(stamp.date),
        u32(crc),
        u32(size),
        u32(size),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes
      ])
    );
    offset += localHeader.length + nameBytes.length + size;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const eocd = concatChunks([
    u32(101010256),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(offset),
    u16(0)
  ]);
  return concatChunks([...chunks, ...central, eocd]);
}

module.exports = {
  CRC_TABLE,
  crc32,
  dosTime,
  u16,
  u32,
  concatChunks,
  buildZip,
};
