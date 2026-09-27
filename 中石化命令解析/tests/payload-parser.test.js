const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { aggregateFrames, extractFrames } = require("../js/frame-parser.js");
const { findField, parsePayload } = require("../js/payload-parser.js");

const REALTIME_FRAME = "FA 00 00 6C 00 13 31 01 02 63 00 00 26 99 00 05 29 02 EC A7 F2";
const TRANSACTION_FRAME = "FA 00 00 6F 00 96 32 00 00 59 EB 07 20 26 09 25 20 26 15 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 27 10 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 63 10 20 00 05 39 02 EC 00 02 96 F3 17 00 0F 3B 45 34 00 00 00 02 EC 00 00 00 00 00 00 79";

function parseHexFrame(source) {
  const result = extractFrames(source);
  assert.equal(result.frames.length, 1);
  return parsePayload(result.frames[0]);
}

test("decodes the real 31H frame using big-endian values and protocol units", () => {
  const parsed = parseHexFrame(REALTIME_FRAME);
  assert.equal(parsed.code, 0x31);
  assert.equal(parsed.variant, "加油机发送实时信息");
  assert.equal(findField(parsed, "message-count").value, "1");
  assert.equal(findField(parsed, "gun-0").value, "99");
  assert.equal(findField(parsed, "amount-0").value, "98.81 元");
  assert.equal(findField(parsed, "volume-0").value, "13.21 升");
  assert.equal(findField(parsed, "price-0").value, "7.48 元/升");
  assert.equal(parsed.diagnostics.filter((item) => item.level !== "info").length, 0);
});

test("decodes and groups the real 96-byte transaction payload", () => {
  const parsed = parseHexFrame(TRANSACTION_FRAME);
  assert.equal(parsed.code, 0x32);
  assert.equal(parsed.variant, "加油机发送成交数据");
  assert.equal(parsed.isLong, true);
  assert.equal(parsed.groups.length, 4);
  assert.equal(findField(parsed, "pos-ttc").value, "23019");
  assert.equal(findField(parsed, "transaction-time").value, "2026-09-25 20:26:15");
  assert.equal(findField(parsed, "transaction-type").description.includes("非卡机联动加油"), true);
  assert.equal(findField(parsed, "gun").value, "99");
  assert.equal(findField(parsed, "product-code").value, "1020");
  assert.equal(findField(parsed, "price").value, "7.48 元/升");
  assert.equal(parsed.diagnostics.filter((item) => item.level !== "info").length, 0);
});

test("selects request and response variants that share a command byte", () => {
  const cases = [
    [[0x30], "加油机对 PC 机普通查询"],
    [[0x30, ...Array(16).fill(0)], "PC 机对加油机普通查询"],
    [[0x32, 0x00], "PC 机回应成交数据"],
    [[0x33, 0x00, 0x00, 0x01], "加油机申请下载数据"],
    [[0x33, 0x00, 0x00, 0x00, 0x20, 0x04], "PC 机发送下载数据总长度"],
    [[0x34, 0x04, 0x00, 0x00, 0x01], "加油机申请下载数据内容"],
    [[0x36, ...Array(10).fill(0)], "加油机申请查询黑白名单"],
    [[0x36, 0x00, ...Array(10).fill(0)], "PC 机回复黑白名单查询结果"],
    [[0x38], "PC 机读取加油累计数"],
    [[0x3a], "PC 机读取加油机信息"],
  ];

  for (const [payload, expected] of cases) {
    const parsed = parsePayload({ payload });
    assert.equal(parsed.variant, expected);
  }
});

test("unknown manufacturer command preserves all raw payload bytes", () => {
  const parsed = parsePayload({ payload: [0x50, 0x01, 0xfa, 0x02] });
  assert.equal(parsed.name, "厂家自定义命令");
  assert.equal(findField(parsed, "raw-payload").rawHex, "01 FA 02");
});

test("warns when an inserted-card realtime segment is shorter than its fixed fields", () => {
  const parsed = parsePayload({ payload: [0x31, 0x01, 0x01, 0x02, 0x04, 0x12, 0x34, 0x56, 0x78] });
  assert.equal(parsed.variant, "加油机发送实时信息");
  assert.equal(parsed.diagnostics.some((item) => item.level === "error" || item.level === "warning"), true);
});

test("locates shifted fuel fields in the supplied implementation logs", () => {
  const sample = fs.readFileSync(path.join(__dirname, "fixtures", "sample-log.txt"), "utf8");
  const transactionGroups = aggregateFrames(extractFrames(sample).frames)
    .filter((group) => group.frame.payload[0] === 0x32);
  assert.equal(transactionGroups.length, 2);
  transactionGroups.forEach((group) => {
    const parsed = parsePayload(group.frame);
    assert.equal(findField(parsed, "gun").value, "99");
    assert.equal(findField(parsed, "product-code").value, "1020");
    assert.equal(findField(parsed, "volume").value, "13.37 升");
    assert.equal(findField(parsed, "price").value, "7.48 元/升");
    assert.equal(findField(parsed, "transaction-mac").warnings.length > 0, true);
  });
});
