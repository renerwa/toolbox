const test = require("node:test");
const assert = require("node:assert/strict");

const { findField, parsePayload, resolveProtocol } = require("../js/payload-parser.js");
const { crc16, extractFrames } = require("../js/frame-parser.js");
const { commandCatalog } = require("../js/protocol-19.js");

function payload19(bytes) {
  return parsePayload({ payload: bytes });
}

function setBytes(target, offset, values) {
  values.forEach((value, index) => {
    target[offset + index] = value;
  });
}

function bcdByte(value) {
  return Number.parseInt(String(value).padStart(2, "0"), 16);
}

function makeFrame(payload, control) {
  const header = [0xfa, 0x00, 0x00, control, Math.floor(payload.length / 100), bcdByte(payload.length % 100)];
  const crc = crc16(header.slice(1).concat(payload));
  return header.concat(payload, [crc >>> 8, crc & 0xff]);
}

function hexText(bytes) {
  return bytes.map((value) => value.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function buildTransactionPayload(command) {
  const payload = Array(196).fill(0);
  payload[0] = command;
  setBytes(payload, 1, [0x00, 0x00, 0x59, 0xeb]);
  payload[5] = 0x60;
  setBytes(payload, 6, [0x20, 0x26, 0x09, 0x25, 0x20, 0x26, 0x15]);
  setBytes(payload, 13, [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  setBytes(payload, 23, [0x00, 0x00, 0x27, 0x10]);
  setBytes(payload, 27, [0x00, 0x26, 0x99]);
  setBytes(payload, 30, [0x00, 0x01]);
  payload[64] = 0x00;
  payload[65] = 0x00;
  payload[66] = 0x02;
  payload[67] = 0x12;
  payload[68] = 0x63;
  setBytes(payload, 69, [0x10, 0x20]);
  setBytes(payload, 71, [0x00, 0x05, 0x29]);
  setBytes(payload, 74, [0x02, 0xec]);
  payload[76] = 0x05;
  setBytes(payload, 77, [0x00, 0x00, 0x27, 0x10]);
  setBytes(payload, 81, [0x00, 0x26, 0x99]);
  payload[84] = 0x05;
  setBytes(payload, 95, [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
  setBytes(payload, 120, [0x12, 0x34, 0x00]);
  setBytes(payload, 123, [0x56, 0x78, 0x00]);
  payload[126] = 0x02;
  setBytes(payload, 192, [0xaa, 0xbb, 0xcc, 0xdd]);
  return payload;
}

test("auto protocol routing preserves 09版 and selects 19版 commands", () => {
  assert.equal(resolveProtocol({ payload: [0x10] }), "v19");
  assert.equal(resolveProtocol({ payload: [0x42] }), "v19");
  assert.equal(resolveProtocol({ payload: [0x31] }), "v1");
  assert.equal(resolveProtocol({ payload: [0x50, 0x01, 0xfa, 0x02] }), "v1");
  assert.equal(resolveProtocol({ payload: Array(56).fill(0).map((_, index) => index === 0 ? 0x50 : 0) }), "v19");
});

test("19版 command catalog covers every defined command byte", () => {
  const codes = [
    0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
    0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23,
    0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d,
    0x2f, 0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
    0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f, 0x50, 0x51, 0x55,
  ];
  codes.forEach((code) => assert.ok(commandCatalog[code], `missing command ${code.toString(16)}H`));
  assert.equal(Object.keys(commandCatalog).length, codes.length);
});

test("extracts complete 19版 frames before dispatching the payload parser", () => {
  const pollPayload = [
    0x11,
    0x20, 0x26, 0x09, 0x25, 0x20, 0x26, 0x15,
    0x00, 0x03, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x00,
  ];
  const pollFrame = makeFrame(pollPayload, 0x40);
  const extracted = extractFrames(hexText(pollFrame));
  assert.equal(extracted.frames.length, 1);
  assert.equal(extracted.frames[0].crc.state, "valid");
  assert.equal(extracted.frames[0].declaredLength, 17);
  const pollParsed = parsePayload(extracted.frames[0]);
  assert.equal(pollParsed.protocol, "v19");
  assert.equal(pollParsed.variant, "轮询应答");

  const transactionFrame = makeFrame(buildTransactionPayload(0x2c), 0x40);
  const transactionExtracted = extractFrames(hexText(transactionFrame));
  assert.equal(transactionExtracted.frames[0].declaredLength, 196);
  assert.equal(transactionExtracted.frames[0].crc.state, "valid");
  assert.equal(parsePayload(transactionExtracted.frames[0]).variant, "上传交易数据");
});

test("parses 19版 poll gun work state and authorization mode", () => {
  const parsed = payload19([0x10, 0x02, 0x01, 0x01, 0x00, 0x02, 0x00, 0x01]);
  assert.equal(parsed.protocol, "v19");
  assert.equal(parsed.protocolLabel, "19版");
  assert.equal(parsed.variant, "加油机轮询");
  assert.equal(findField(parsed, "gun-count").value, "2");
  assert.equal(findField(parsed, "gun-0").value, "1");
  assert.equal(findField(parsed, "work-state-0").description, "上班");
  assert.equal(findField(parsed, "auth-mode-0").description, "前庭");
  assert.equal(findField(parsed, "work-state-1").description, "下班");
  assert.equal(findField(parsed, "auth-mode-1").description, "后台");
});

test("parses 19版 poll response time and software flag", () => {
  const parsed = payload19([
    0x11,
    0x20, 0x26, 0x09, 0x25, 0x20, 0x26, 0x15,
    0x00, 0x03, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x01,
  ]);
  assert.equal(parsed.variant, "轮询应答");
  assert.equal(findField(parsed, "pc-time").value, "2026-09-25 20:26:15");
  assert.equal(findField(parsed, "base-black-version").value, "3");
  assert.equal(findField(parsed, "software-flag").value, "有新的程序需要下载");
  assert.equal(parsed.diagnostics.length, 0);
});

test("parses 19版 fueling realtime segment with times and flow rates", () => {
  const bytes = [
    0x12, 0x01, 0x02, 0x02,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    0x00,
    0x00, 0x26, 0x99,
    0x00, 0x05, 0x29,
    0x02, 0xec,
    0x20, 0x26, 0x09, 0x25, 0x20, 0x26, 0x15,
    0x20, 0x26, 0x09, 0x25, 0x20, 0x27, 0x00,
    0x20, 0x26, 0x09, 0x25, 0x20, 0x28, 0x10,
    0x20, 0x26, 0x09, 0x25, 0x20, 0x29, 0x20,
    0x00, 0x12, 0x34,
    0x00, 0x56, 0x78,
    0x02,
  ];
  const parsed = payload19(bytes);
  assert.equal(parsed.variant, "加油机实时数据");
  assert.equal(findField(parsed, "status-0").description, "提枪加油中");
  assert.equal(findField(parsed, "amount-0").value, "98.81 元");
  assert.equal(findField(parsed, "volume-0").value, "13.21 升");
  assert.equal(findField(parsed, "price-0").value, "7.48 元/升");
  assert.equal(findField(parsed, "nozzle-up-0").value, "2026-09-25 20:26:15");
  assert.equal(findField(parsed, "avg-flow-0").value, "12.34 L/M");
  assert.equal(findField(parsed, "max-flow-0").value, "56.78 L/M");
  assert.equal(findField(parsed, "sale-type-0").description, "随意");

  const pointsBytes = bytes.slice();
  pointsBytes[14] = 0x01;
  assert.equal(findField(payload19(pointsBytes), "amount-0").value, "98.81 点");
});

test("parses 19版 authorization result with variable additional information", () => {
  const parsed = payload19([
    0x15,
    0x01,
    0x00, 0x00, 0x00, 0x01,
    0x05,
    0x02, 0xec,
    0x04, 0xd6, 0xd0, 0xb9, 0xfa,
    0x00, 0x26, 0x99,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    0x01,
    0xaa, 0xbb, 0xcc, 0xdd,
  ]);
  assert.equal(parsed.variant, "授权请求结果");
  assert.equal(findField(parsed, "add-in-length").value, "4");
  assert.equal(findField(parsed, "add-in").value, "中国");
  assert.equal(findField(parsed, "auth-result").description, "允许授权请求的付款方式");
  assert.equal(parsed.diagnostics.length, 0);
});

test("parses 19版 price change records and command acknowledgement", () => {
  const price = payload19([
    0x1a, 0x02,
    0x20, 0x26, 0x09, 0x25, 0x20, 0x26, 0x15,
    0x01, 0x02, 0xec, 0x02, 0xd0,
    0x02, 0x02, 0xf4, 0x02, 0xee,
    0x11, 0x22, 0x33, 0x44,
  ]);
  assert.equal(price.variant, "变价命令");
  assert.equal(findField(price, "gun-0").value, "1");
  assert.equal(findField(price, "new-price-0").value, "7.48 元/升");
  assert.equal(findField(price, "old-price-1").value, "7.50 元/升");

  const ack = payload19([0x55, 0x18, 0x00, 0x05]);
  assert.equal(ack.variant, "命令数据应答");
  assert.equal(findField(ack, "original-command").value, "18H");
  assert.equal(findField(ack, "result").description, "收到交易数据，正确");
});

test("parses 19版 gray-record result and gun totals", () => {
  const gray = payload19([
    0x1f,
    0x00,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    0x00, 0x00, 0x27, 0x10,
    0x00, 0x26, 0x99,
    0x00, 0x01,
    0x08,
    0x20, 0x26, 0x09, 0x25, 0x20, 0x26, 0x15,
    0x11, 0x22, 0x33, 0x44,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
    0x00, 0x00, 0x00, 0x02,
  ]);
  assert.equal(gray.variant, "灰记录查询结果");
  assert.equal(findField(gray, "match-flag").description, "匹配");
  assert.equal(findField(gray, "ds").description, "现金");
  assert.equal(findField(gray, "amount").value, "98.81 元");
  assert.equal(gray.diagnostics.length, 0);

  const total = payload19([0x23, 0x02, 0x01, 0x00, 0x00, 0x05, 0x39, 0x02, 0x00, 0x00, 0x27, 0x10]);
  assert.equal(total.variant, "加油累计数");
  assert.equal(findField(total, "total-0").value, "13.37 升");
  assert.equal(findField(total, "total-1").value, "100.00 升");
});

test("parses 19版 card record batches", () => {
  const parsed = payload19([
    0x1d,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    0x01,
    0x00, 0x05,
    0x00, 0x00, 0x64,
    0x00, 0x00, 0x27, 0x10,
    0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
    0x20, 0x26, 0x09, 0x25,
    0x20, 0x26, 0x15,
  ]);
  assert.equal(parsed.variant, "加油卡内交易明细");
  assert.equal(findField(parsed, "record-no").value, "01H");
  assert.equal(findField(parsed, "amount-0").value, "100.00 元");
  assert.equal(findField(parsed, "transaction-date-0").value, "2026-09-25");
  assert.equal(findField(parsed, "transaction-time-0").value, "20:26:15");
});

test("parses the 19版 195-byte transaction record in semantic groups", () => {
  const parsed = payload19(buildTransactionPayload(0x2c));
  assert.equal(parsed.protocol, "v19");
  assert.equal(parsed.variant, "上传交易数据");
  assert.equal(parsed.isLong, true);
  assert.equal(parsed.groups.length, 5);
  assert.equal(findField(parsed, "pos-ttc").value, "23019");
  assert.equal(findField(parsed, "transaction-type").description.includes("离线交易"), true);
  assert.equal(findField(parsed, "transaction-time").value, "2026-09-25 20:26:15");
  assert.equal(findField(parsed, "amount").value, "98.81 元");
  assert.equal(findField(parsed, "product-code").value, "1020");
  assert.equal(findField(parsed, "product-code").description, "92# 清洁汽油");
  assert.equal(findField(parsed, "volume").value, "13.21 升");
  assert.equal(findField(parsed, "price").value, "7.48 元/升");
  assert.equal(parsed.diagnostics.filter((item) => item.level !== "info").length, 0);
});

test("supports forced protocol selection and 19版 reserved command warnings", () => {
  const forcedV1 = parsePayload({ payload: [0x10, 0x01] }, { protocol: "v1" });
  assert.equal(forcedV1.protocol, "v1");

  const reserved = parsePayload({ payload: [0x31, 0x00] }, { protocol: "v19" });
  assert.equal(reserved.protocol, "v19");
  assert.equal(reserved.variant, "协议保留命令");
});
