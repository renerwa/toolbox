const test = require("node:test");
const assert = require("node:assert/strict");

const {
  aggregateFrames,
  crc16,
  decodeBcdLength,
  extractFrames,
} = require("../js/frame-parser.js");

const SAMPLE_LOG = `
2026-09-26 11:14:42.0065 TRACE    66 数据去除转义符成功..FA 00 00 6C 00 13 31 01 02 63 00 00 26 99 00 05 29 02 EC
2026-09-26 11:14:42.0065 TRACE    66 加上CRC..FA 00 00 6C 00 13 31 01 02 63 00 00 26 99 00 05 29 02 EC A7 F2
2026-09-26 11:14:42.0065 TRACE    66 handleData:FA 00 00 6C 00 13 31 01 02 63 00 00 26 99 00 05 29 02 EC A7 F2
2026-09-26 11:14:43.9299 TRACE    63 receive data:FA 00 00 6D 00 13 31 01 02 63 00 00 26 EB 00 05 34 02 EC E3 A9
2026-09-26 11:14:43.9299 TRACE    63 current data:FA 00 00 6D 00 13 31 01 02 63 00 00 26 EB 00 05 34 02 EC E3 A9
2026-09-26 11:14:43.9299 TRACE    63 数据去除转义符成功..FA 00 00 6D 00 13 31 01 02 63 00 00 26 EB 00 05 34 02 EC
2026-09-26 11:14:43.9299 TRACE    63 加上CRC..FA 00 00 6D 00 13 31 01 02 63 00 00 26 EB 00 05 34 02 EC E3 A9
2026-09-26 11:14:43.9299 TRACE    63 handleData:FA 00 00 6D 00 13 31 01 02 63 00 00 26 EB 00 05 34 02 EC E3 A9
`;

test("CRC matches both examples from appendix 3", () => {
  assert.equal(crc16([1, 2, 3, 4, 5, 6, 7, 8]), 0xc4f0);
  assert.equal(crc16([8, 7, 6, 5, 4, 3, 2, 1]), 0x908a);
});

test("compressed BCD length is decimal, not hexadecimal", () => {
  assert.deepEqual(decodeBcdLength(0x00, 0x13), {
    valid: true,
    value: 13,
    text: "0013",
  });
  assert.equal(decodeBcdLength(0x00, 0x9a).valid, false);
});

test("extracts real log frames and merges CRC/no-CRC copies", () => {
  const result = extractFrames(SAMPLE_LOG, { batchId: 3 });
  assert.equal(result.frames.length, 8);
  assert.equal(result.diagnostics.filter((item) => item.level === "error").length, 0);

  const groups = aggregateFrames(result.frames);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[1].count, 5);
  assert.deepEqual(groups[0].crcStates.sort(), ["missing", "valid"]);
  assert.equal(groups[0].frame.declaredLength, 13);
  assert.equal(groups[0].frame.payload[0], 0x31);
  assert.equal(groups[0].frame.frameNumber, 44);
  assert.equal(groups[0].frame.caller, "PC 主动模式");
});

test("accepts pure hex and reports a bad CRC without losing the payload", () => {
  const source = "FA 00 00 6C 00 13 31 01 02 63 00 00 26 99 00 05 29 02 EC A7 00";
  const result = extractFrames(source);
  assert.equal(result.frames.length, 1);
  assert.equal(result.frames[0].complete, true);
  assert.equal(result.frames[0].crc.state, "invalid");
  assert.equal(result.frames[0].payload.length, 13);
});

test("splits multiple pure frames by BCD length", () => {
  const source = [
    "FA 00 00 6C 00 13 31 01 02 63 00 00 26 99 00 05 29 02 EC A7 F2",
    "FA 00 00 6D 00 13 31 01 02 63 00 00 26 EB 00 05 34 02 EC E3 A9",
  ].join(" ");
  const result = extractFrames(source);
  assert.equal(result.frames.length, 2);
  assert.equal(result.frames.every((frame) => frame.crc.state === "valid"), true);
});

test("keeps bytes after the declared payload visible as a diagnostic", () => {
  const source = "FA 00 00 00 00 01 30 12 34 56";
  const result = extractFrames(source);
  assert.equal(result.frames.length, 1);
  assert.deepEqual(result.frames[0].trailingBytes, [0x12, 0x34, 0x56]);
  assert.equal(result.frames[0].diagnostics.some((item) => item.message.includes("3 个额外字节")), true);
});

test("removes doubled FA escape bytes before length and CRC validation", () => {
  const canonicalWithoutSync = [0x00, 0x00, 0x00, 0x00, 0x02, 0x50, 0xfa];
  const crc = crc16(canonicalWithoutSync);
  const source = `FA 00 00 00 00 02 50 FA FA ${(crc >>> 8).toString(16).padStart(2, "0")} ${(crc & 0xff).toString(16).padStart(2, "0")}`;
  const result = extractFrames(source);
  assert.equal(result.frames.length, 1);
  assert.deepEqual(result.frames[0].payload, [0x50, 0xfa]);
  assert.equal(result.frames[0].escapedInput, true);
  assert.equal(result.frames[0].crc.state, "valid");
});
