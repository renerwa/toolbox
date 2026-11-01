(function (root, factory) {
  const protocol = typeof module === "object" && module.exports
    ? require("./protocol-v1.js")
    : root.SinopecProtocolV1;
  const frameUtils = typeof module === "object" && module.exports
    ? require("./frame-parser.js")
    : root.SinopecFrameParser;
  const payloadParser19 = typeof module === "object" && module.exports
    ? require("./payload-parser-19.js")
    : root.SinopecPayloadParser19;
  const api = factory(protocol, frameUtils, payloadParser19);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SinopecPayloadParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (protocol, frameUtils, payloadParser19) {
  "use strict";

  const { bytesHex, byteHex } = frameUtils;

  function unsignedBigInt(bytes) {
    return Array.from(bytes || []).reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
  }

  function unsignedText(bytes) {
    return unsignedBigInt(bytes).toString(10);
  }

  function scaledText(bytes, unit, scale) {
    const divisor = BigInt(scale || 100);
    const value = unsignedBigInt(bytes);
    const whole = value / divisor;
    const fractionDigits = divisor.toString().length - 1;
    const fraction = (value % divisor).toString().padStart(fractionDigits, "0");
    return `${whole}.${fraction} ${unit}`;
  }

  function bcdDigits(bytes) {
    let value = "";
    const warnings = [];
    Array.from(bytes || []).forEach((byte, index) => {
      const high = byte >>> 4;
      const low = byte & 0x0f;
      if (high > 9 || low > 9) warnings.push(`第 ${index + 1} 字节不是合法压缩 BCD`);
      value += high.toString(16).toUpperCase() + low.toString(16).toUpperCase();
    });
    return { value, warnings };
  }

  function bcdDateTime(bytes) {
    const decoded = bcdDigits(bytes);
    if (decoded.warnings.length || decoded.value.length !== 14) {
      return { value: decoded.value || "-", warnings: decoded.warnings.concat("日期时间格式应为 7 字节 BCD") };
    }
    const digits = decoded.value;
    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    const hour = Number(digits.slice(8, 10));
    const minute = Number(digits.slice(10, 12));
    const second = Number(digits.slice(12, 14));
    const daysInMonth = month >= 1 && month <= 12 ? new Date(year, month, 0).getDate() : 0;
    const valid = year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth
      && hour <= 23 && minute <= 59 && second <= 59;
    return {
      value: `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`,
      warnings: valid ? [] : ["BCD 数字合法，但日期或时间范围无效"],
    };
  }

  function bcdDate(bytes) {
    const decoded = bcdDigits(bytes);
    if (decoded.value.length !== 8) return decoded;
    return {
      value: `${decoded.value.slice(0, 4)}-${decoded.value.slice(4, 6)}-${decoded.value.slice(6, 8)}`,
      warnings: decoded.warnings,
    };
  }

  function asciiText(bytes) {
    return Array.from(bytes || [], (byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : "·"))
      .join("")
      .replace(/[ ·]+$/g, "") || "（空）";
  }

  function settlementUnit(byte) {
    const unitCode = byte & 0x03;
    if (unitCode === 0) return { code: unitCode, label: "金额", unit: "元" };
    if (unitCode === 1) return { code: unitCode, label: "积分", unit: "点" };
    return { code: unitCode, label: `保留单位 ${unitCode}`, unit: "单位" };
  }

  function decodeResult(value, description, warnings) {
    return { value: String(value), description: description || "", warnings: warnings || [] };
  }

  class PayloadCursor {
    constructor(payload, diagnostics) {
      this.payload = Array.from(payload || []);
      this.pos = 0;
      this.diagnostics = diagnostics;
    }

    remaining() {
      return Math.max(this.payload.length - this.pos, 0);
    }

    peek(offset) {
      return this.payload[this.pos + (offset || 0)];
    }

    read(group, spec) {
      const start = this.pos;
      const expected = Math.max(Number(spec.length) || 0, 0);
      const raw = this.payload.slice(start, start + expected);
      this.pos += expected;
      const warnings = [];
      if (raw.length < expected) {
        const message = `${spec.name} 需要 ${expected} 字节，剩余 ${raw.length} 字节。`;
        warnings.push(message);
        this.diagnostics.push({ level: "error", message });
      }

      let decoded;
      try {
        decoded = spec.decode ? spec.decode(raw, start) : decodeResult(bytesHex(raw));
      } catch (error) {
        decoded = decodeResult(bytesHex(raw), "解码失败", [error.message]);
      }
      group.fields.push({
        key: spec.key,
        name: spec.name,
        offset: 6 + start,
        payloadOffset: start,
        length: expected,
        actualLength: raw.length,
        raw,
        rawHex: bytesHex(raw),
        value: decoded.value,
        description: decoded.description || spec.description || "",
        warnings: warnings.concat(decoded.warnings || []),
      });
      return raw;
    }
  }

  function group(id, title, description) {
    return { id, title, description: description || "", fields: [] };
  }

  function enumDecoder(values, formatter) {
    return (raw) => {
      const value = raw[0];
      const label = Object.prototype.hasOwnProperty.call(values, value) ? values[value] : "未知值";
      return decodeResult(formatter ? formatter(value) : String(value), label, label === "未知值" ? ["协议未定义该枚举值"] : []);
    };
  }

  function addCommand(cursor, target, variant) {
    cursor.read(target, {
      key: "command",
      name: "Handle 命令字",
      length: 1,
      decode: (raw) => decodeResult(raw.length ? `${byteHex(raw[0])}H` : "-", variant),
    });
  }

  function addTrailingData(cursor, groups, title) {
    if (!cursor.remaining()) return;
    const extra = group("extra", title || "未定义的附加数据");
    cursor.read(extra, {
      key: "extra-data",
      name: "附加字节",
      length: cursor.remaining(),
      decode: (raw) => decodeResult(bytesHex(raw), "当前格式未定义这些字节", ["存在协议格式之外的附加数据"]),
    });
    groups.push(extra);
  }

  function parse30(cursor, groups, length) {
    const header = group("query", "普通查询");
    const variant = length === 1 ? "加油机对 PC 机普通查询" : "PC 机对加油机普通查询";
    addCommand(cursor, header, variant);
    if (length > 1) {
      cursor.read(header, { key: "pc-time", name: "PC_TIME PC 机时间", length: 7, decode: bcdDateTime });
      cursor.read(header, { key: "base-black-version", name: "BL_VER 基础黑名单版本", length: 2, decode: (raw) => decodeResult(unsignedText(raw), raw.every((b) => b === 0) ? "0 表示数据无效" : "") });
      [
        ["add-black-version", "ADD_BL_VER 新增黑名单版本"],
        ["delete-black-version", "DEL_BL_VER 新删黑名单版本"],
        ["white-version", "WH_VER 白名单版本"],
        ["price-version", "PRC_VER 油品油价版本"],
        ["station-version", "Sta_VER 油站通用信息版本"],
      ].forEach(([key, name]) => cursor.read(header, { key, name, length: 1, decode: (raw) => decodeResult(unsignedText(raw), raw[0] === 0 ? "0 表示数据无效" : "") }));
      cursor.read(header, { key: "private-data-flag", name: "SELF_D_VER 私有数据更新标志", length: 1, decode: (raw) => decodeResult(raw[0] & 1 ? "有新数据" : "无新数据", `原始位 b0=${raw[0] & 1}`) });
      cursor.read(header, { key: "software-flag", name: "SOFT_FLAG 程序更新标志", length: 1, decode: (raw) => decodeResult(raw[0] & 1 ? "有新程序" : "无新程序", `原始位 b0=${raw[0] & 1}`) });
    }
    groups.push(header);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parse31(cursor, groups) {
    const header = group("realtime-header", "实时信息概要");
    addCommand(cursor, header, "加油机发送实时信息");
    const countRaw = cursor.read(header, { key: "message-count", name: "COUNT 信息数量", length: 1, decode: (raw) => decodeResult(unsignedText(raw), "后续终端信息段数量") });
    const count = countRaw[0] || 0;
    groups.push(header);

    for (let index = 0; index < count; index += 1) {
      if (cursor.remaining() < 2) {
        cursor.diagnostics.push({ level: "error", message: `第 ${index + 1} 个实时信息段不完整。` });
        break;
      }
      const status = cursor.peek();
      const statusLabel = status === 1 ? "卡已插入" : status === 2 ? "抬枪或加油中" : `状态 ${status}`;
      const item = group(`realtime-${index + 1}`, `实时信息 ${index + 1} · ${statusLabel}`);
      cursor.read(item, { key: `status-${index}`, name: "St 状态字", length: 1, decode: () => decodeResult(String(status), statusLabel, status === 1 || status === 2 ? [] : ["协议只定义状态 1 和 2 的详细格式"]) });
      cursor.read(item, { key: `gun-${index}`, name: "NZN 枪号", length: 1, decode: (raw) => decodeResult(unsignedText(raw), "逻辑枪号") });

      if (status === 1) {
        const lengthRaw = cursor.read(item, { key: `card-length-${index}`, name: "LEN 卡信息长度", length: 1, decode: (raw) => decodeResult(unsignedText(raw), "从卡应用号到卡片信息的总长度") });
        const cardLength = lengthRaw[0] || 0;
        const availableForCard = Math.min(cardLength, cursor.remaining());
        if (cardLength < 16) {
          cursor.diagnostics.push({ level: "warning", message: `第 ${index + 1} 个卡信息段长度为 ${cardLength}，小于固定字段所需的 16 字节。` });
        }
        const cardStart = cursor.pos;
        cursor.read(item, { key: `asn-${index}`, name: "ASN 卡应用号", length: Math.min(10, availableForCard), decode: (raw) => { const result = bcdDigits(raw); return decodeResult(result.value, "右对齐，前补 0", result.warnings); } });
        const usedAfterAsn = cursor.pos - cardStart;
        cursor.read(item, { key: `card-status-${index}`, name: "CardSt 卡状态", length: Math.min(2, Math.max(availableForCard - usedAfterAsn, 0)), decode: (raw) => { const result = bcdDigits(raw); return decodeResult(result.value, protocol.cardStatusCodes[result.value] || "协议未列出的卡状态", result.warnings); } });
        const usedAfterStatus = cursor.pos - cardStart;
        cursor.read(item, { key: `balance-${index}`, name: "BAL 余额", length: Math.min(4, Math.max(availableForCard - usedAfterStatus, 0)), decode: (raw) => decodeResult(scaledText(raw, "元", 100), "单位按交易结算单位理解") });
        const used = cursor.pos - cardStart;
        const icLength = Math.max(Math.min(cardLength - used, cursor.remaining()), 0);
        if (icLength) cursor.read(item, { key: `ic-data-${index}`, name: "IC-DATA 卡片信息", length: icLength, decode: (raw) => decodeResult(bytesHex(raw), "变长卡片数据") });
        if (cardLength > availableForCard) cursor.diagnostics.push({ level: "error", message: `第 ${index + 1} 个卡信息段声明 ${cardLength} 字节，实际只剩 ${availableForCard} 字节。` });
      } else if (status === 2) {
        const unitRaw = cursor.read(item, { key: `unit-${index}`, name: "P_UNIT 结算单位/方式", length: 1, decode: (raw) => { const unit = settlementUnit(raw[0] || 0); const method = protocol.settlementMethods[(raw[0] >>> 4) & 0x0f] || "未知方式"; return decodeResult(`${unit.label} / ${method}`, `低 2 位=${unit.code}，高 4 位=${(raw[0] >>> 4) & 0x0f}`); } });
        const unit = settlementUnit(unitRaw[0] || 0);
        cursor.read(item, { key: `amount-${index}`, name: "AMN 数额", length: 3, decode: (raw) => decodeResult(scaledText(raw, unit.unit, 100), unit.label) });
        cursor.read(item, { key: `volume-${index}`, name: "VOL 升数", length: 3, decode: (raw) => decodeResult(scaledText(raw, "升", 100), "单位 0.01 升") });
        cursor.read(item, { key: `price-${index}`, name: "PRC 价格", length: 2, decode: (raw) => decodeResult(scaledText(raw, "元/升", 100), "单位 0.01 元") });
      }
      groups.push(item);
    }
    addTrailingData(cursor, groups);
    return "加油机发送实时信息";
  }

  function transactionTypeDescription(byte) {
    const subtype = byte & 0x0f;
    const parts = [protocol.transactionTypes[subtype] || `未知类型 ${subtype}`];
    if (byte & 0x80) parts.push("卡错标志");
    parts.push(byte & 0x40 ? "使用油机内黑/白名单" : "使用后台黑/白名单");
    if (byte & 0x10) parts.push("扣款签名有效");
    return parts.join("；");
  }

  function plausibleProductCode(bytes) {
    if (!bytes || bytes.length < 2) return false;
    const decoded = bcdDigits(bytes);
    return decoded.warnings.length === 0 && /^[12]/.test(decoded.value);
  }

  function locateFuelStart(payload, nominalStart) {
    let best = null;
    const lastStart = Math.min(nominalStart + 12, payload.length - 13);
    for (let start = nominalStart; start <= lastStart; start += 1) {
      const productBytes = payload.slice(start + 1, start + 3);
      if (!plausibleProductCode(productBytes)) continue;
      const gun = payload[start];
      const price = Number(unsignedBigInt(payload.slice(start + 6, start + 8)));
      const product = bcdDigits(productBytes).value;
      let score = 20 - (start - nominalStart);
      if (gun <= 249) score += 3;
      if (price >= 100 && price <= 2000) score += 5;
      if (protocol.productCodes[product]) score += 4;
      if (!best || score > best.score) best = { start, score };
    }
    return best ? best.start : nominalStart;
  }

  function parseTransaction(cursor, groups, length, frame) {
    const identity = group("transaction-identity", "交易标识");
    addCommand(cursor, identity, "加油机发送成交数据");
    const hasPosAddress = length === 97;
    if (hasPosAddress) {
      cursor.read(identity, { key: "pos-address", name: "POS-P 终端机身号", length: 1, decode: (raw) => decodeResult(unsignedText(raw), "部分实现由管控 PC 加入") });
    }
    const recordStart = cursor.pos;
    const unitByte = cursor.payload[recordStart + 64] || 0;
    const unit = settlementUnit(unitByte);
    cursor.read(identity, { key: "pos-ttc", name: "POS-TTC 终端交易号", length: 4, decode: (raw) => decodeResult(unsignedText(raw), "每笔交易连续递增") });
    const typeRaw = cursor.read(identity, { key: "transaction-type", name: "T-TYPE 交易类型", length: 1, decode: (raw) => decodeResult(`${byteHex(raw[0] || 0)}H`, transactionTypeDescription(raw[0] || 0)) });
    const transactionSubtype = (typeRaw[0] || 0) & 0x0f;
    cursor.read(identity, { key: "transaction-time", name: "TIME 日期及时间", length: 7, decode: bcdDateTime });
    groups.push(identity);

    const card = group("transaction-card", "卡片、金额与认证");
    cursor.read(card, { key: "card-asn", name: "ASN 卡应用号", length: 10, decode: (raw) => { const result = bcdDigits(raw); return decodeResult(result.value, "20 位十进制应用号", result.warnings); } });
    cursor.read(card, { key: "balance", name: "BAL 余额", length: 4, decode: (raw) => decodeResult(scaledText(raw, unit.unit, 100), unit.label) });
    cursor.read(card, { key: "amount", name: "AMN 数额", length: 3, decode: (raw) => decodeResult(scaledText(raw, unit.unit, 100), unit.label) });
    cursor.read(card, { key: "ctc", name: "CTC 卡交易序号", length: 2, decode: (raw) => decodeResult(unsignedText(raw)) });
    cursor.read(card, { key: "tac", name: "TAC / GTAC 电子签名", length: 4, decode: (raw) => { const code = raw.slice(0, 2).map(byteHex).join(""); return decodeResult(bytesHex(raw), transactionSubtype === 9 ? (protocol.cardStatusCodes[code] || `错误代码 ${code}`) : "交易电子签名"); } });
    cursor.read(card, { key: "gmac", name: "GMAC 解灰认证码", length: 4, decode: (raw) => decodeResult(bytesHex(raw), "逃卡或卡错时有效") });
    cursor.read(card, { key: "psam-tac", name: "PSAM-TAC 灰锁签名", length: 4, decode: (raw) => decodeResult(bytesHex(raw), "逃卡或卡错时有效") });
    cursor.read(card, { key: "psam-asn", name: "PSAM-ASN 应用号", length: 10, decode: (raw) => { const result = bcdDigits(raw); return decodeResult(result.value, "PSAM 卡号", result.warnings); } });
    cursor.read(card, { key: "psam-tid", name: "PSAM-TID 编号", length: 6, decode: (raw) => decodeResult(bytesHex(raw), "用于 TAC / GTAC 运算") });
    cursor.read(card, { key: "psam-ttc", name: "PSAM-TTC 交易号", length: 4, decode: (raw) => decodeResult(unsignedText(raw), "PSAM 终端交易序号") });
    groups.push(card);

    const fuel = group("transaction-fuel", "结算、油枪与油品");
    cursor.read(fuel, { key: "deduction-source", name: "DS 扣款来源", length: 1, decode: enumDecoder(protocol.deductionSources) });
    cursor.read(fuel, { key: "unit", name: "UNIT 结算单位/方式", length: 1, decode: (raw) => { const value = raw[0] || 0; const methodCode = (value >>> 4) & 0x0f; return decodeResult(`${settlementUnit(value).label} / ${protocol.settlementMethods[methodCode] || `未知方式 ${methodCode}`}`, `单位位=${value & 0x03}，方式位=${methodCode}`); } });
    cursor.read(fuel, { key: "card-type", name: "C-TYPE 卡类", length: 1, decode: (raw) => decodeResult(raw[0] & 1 ? "PBOC 金融卡" : "石化规范卡", `b0=${raw[0] & 1}`) });
    cursor.read(fuel, { key: "key-version", name: "VER 密钥版本", length: 1, decode: (raw) => decodeResult(`索引 ${(raw[0] >>> 4) & 0x0f} / 版本 ${raw[0] & 0x0f}`) });
    const nominalFuelStart = cursor.pos;
    const detectedFuelStart = locateFuelStart(cursor.payload, nominalFuelStart);
    const extensionLength = Math.max(detectedFuelStart - nominalFuelStart, 0);
    if (extensionLength) {
      cursor.read(fuel, {
        key: "pos-address-embedded",
        name: extensionLength === 1 ? "POS-P 终端机身号" : "POS-P / 厂商扩展填充",
        length: extensionLength,
        decode: (raw) => decodeResult(bytesHex(raw), extensionLength === 1
          ? "实装报文位于 VER 与 NZN 之间"
          : `枪号前存在 ${extensionLength} 个协议未定义字节`),
      });
      cursor.diagnostics.push({ level: "info", message: `检测到枪号前有 ${extensionLength} 字节实装扩展，后续油枪字段已按实际位置解析。` });
    }
    cursor.read(fuel, { key: "gun", name: "NZN 枪号", length: 1, decode: (raw) => decodeResult(unsignedText(raw), "逻辑枪号") });
    cursor.read(fuel, { key: "product-code", name: "G-CODE 油品代码", length: 2, decode: (raw) => { const result = bcdDigits(raw); return decodeResult(result.value, protocol.productCodes[result.value] || "协议油品表未匹配", result.warnings); } });
    cursor.read(fuel, { key: "volume", name: "VOL 升数", length: 3, decode: (raw) => decodeResult(scaledText(raw, "升", 100), "单位 0.01 升") });
    cursor.read(fuel, { key: "price", name: "PRC 成交价格", length: 2, decode: (raw) => decodeResult(scaledText(raw, "元/升", 100), "单位 0.01 元") });
    cursor.read(fuel, { key: "employee", name: "EMP 员工号", length: 1, decode: (raw) => decodeResult(raw[0] === 0xff ? "无员工上班" : unsignedText(raw)) });
    cursor.read(fuel, { key: "volume-total", name: "V-TOT 升累计", length: 4, decode: (raw) => decodeResult(scaledText(raw, "升", 100), "单位 0.01 升") });
    groups.push(fuel);

    const security = group("transaction-security", "保留区与数据认证");
    const reservedLength = Math.max(cursor.remaining() - 4, 0);
    cursor.read(security, { key: "reserved", name: "RFU 备用", length: reservedLength, decode: (raw) => {
      const warnings = [];
      if (!raw.every((byte) => byte === 0)) warnings.push("备用区存在非零字节");
      if (raw.length !== 11) warnings.push(`实装备用区为 ${raw.length} 字节，协议标准为 11 字节`);
      return decodeResult(bytesHex(raw), raw.every((byte) => byte === 0) ? "全部为 0" : "协议要求全部填 0", warnings);
    } });
    cursor.read(security, { key: "transaction-mac", name: "T-MAC 终端数据认证码", length: 4, decode: (raw) => decodeResult(bytesHex(raw), "从 POS-TTC 开始计算", frame && frame.trailingBytes && frame.trailingBytes.length ? ["声明长度后仍有额外字节，T-MAC 位置可能不可靠"] : []) });
    groups.push(security);
    addTrailingData(cursor, groups);
  }

  function parse32(cursor, groups, length, frame) {
    if (length === 2) {
      const response = group("transaction-response", "成交数据处理结果");
      addCommand(cursor, response, "PC 机回应成交数据");
      cursor.read(response, { key: "result", name: "RESULT 处理结果", length: 1, decode: (raw) => decodeResult(raw[0] & 1 ? "T-MAC 错误" : "处理正确", `b0=${raw[0] & 1}`) });
      groups.push(response);
      return "PC 机回应成交数据";
    }
    parseTransaction(cursor, groups, length, frame);
    return length === 96 ? "加油机发送成交数据" : "加油机发送成交数据（非标准长度）";
  }

  function contentDecoder(raw) {
    const value = raw[0];
    return decodeResult(String(value), protocol.contentTypes[value] || "未知下载内容", protocol.contentTypes[value] ? [] : ["协议未定义该下载内容编号"]);
  }

  function parse33(cursor, groups, length) {
    const request = length <= 4;
    const data = group("download-negotiation", request ? "申请下载数据" : "待下载数据总长度");
    addCommand(cursor, data, request ? "加油机向 PC 机申请下载数据" : "PC 机发送需要下载的数据总长度");
    if (request) {
      cursor.read(data, { key: "content", name: "Content 下载内容", length: 1, decode: contentDecoder });
      cursor.read(data, { key: "base-version", name: "IBL-VER 内部基础黑名单版本", length: 2, decode: (raw) => decodeResult(unsignedText(raw), "下载增删黑名单时有效") });
    } else {
      cursor.read(data, { key: "download-length", name: "BL-LEN 数据总长度", length: 4, decode: (raw) => decodeResult(`${unsignedText(raw)} 字节`, raw.every((byte) => byte === 0) ? "数据合法但内容为空" : "") });
      cursor.read(data, { key: "content", name: "Content 下载内容", length: 1, decode: contentDecoder });
    }
    groups.push(data);
    addTrailingData(cursor, groups);
    return request ? "加油机申请下载数据" : "PC 机发送下载数据总长度";
  }

  function parse34(cursor, groups, length) {
    const request = length === 5;
    const data = group("download-content", request ? "申请下载数据段" : "发送下载数据段");
    addCommand(cursor, data, request ? "加油机申请下载数据内容" : "PC 机发送下载数据");
    cursor.read(data, { key: "content", name: "Content 下载内容", length: 1, decode: contentDecoder });
    cursor.read(data, { key: "segment-offset", name: "S-OFFSET 段偏移", length: 2, decode: (raw) => decodeResult(unsignedText(raw), "每段 16 字节") });
    const segmentRaw = cursor.read(data, { key: "segment-count", name: "SEG 段数", length: 1, decode: (raw) => decodeResult(unsignedText(raw), `期望数据 ${Number(raw[0] || 0) * 16} 字节`) });
    if (!request && cursor.remaining()) {
      cursor.read(data, { key: "download-data", name: "DATA-Content 数据内容", length: cursor.remaining(), decode: (raw) => { const expected = Number(segmentRaw[0] || 0) * 16; return decodeResult(bytesHex(raw), `${raw.length} 字节${raw.length < expected ? "（可能是最后一段）" : ""}`); } });
    }
    groups.push(data);
    return request ? "加油机申请下载数据内容" : "PC 机发送下载数据";
  }

  function readAsn(cursor, target, key) {
    cursor.read(target, { key, name: "ASN 卡应用号", length: 10, decode: (raw) => { const result = bcdDigits(raw); return decodeResult(result.value, "20 位十进制应用号", result.warnings); } });
  }

  function parse35(cursor, groups, length) {
    const response = length > 25;
    const data = group("grey-record", response ? "灰卡查询结果" : "申请解灰");
    addCommand(cursor, data, response ? "PC 机回复灰卡查询结果" : "加油机申请解灰");
    if (response) cursor.read(data, { key: "match", name: "M-FLAG 匹配标志", length: 1, decode: (raw) => decodeResult((raw[0] & 1) === 0 ? "匹配" : "不匹配", `b0=${raw[0] & 1}`) });
    readAsn(cursor, data, "asn");
    cursor.read(data, { key: "balance", name: "BAL 余额", length: 4, decode: (raw) => decodeResult(scaledText(raw, "元", 100), response ? "灰记录余额" : "实际卡余额") });
    if (response) cursor.read(data, { key: "amount", name: "AMN 交易额", length: 3, decode: (raw) => decodeResult(scaledText(raw, "元", 100)) });
    cursor.read(data, { key: "ctc", name: "CTC 卡交易序号", length: 2, decode: (raw) => decodeResult(unsignedText(raw)) });
    cursor.read(data, { key: "deduction-source", name: "DS 扣款来源", length: 1, decode: enumDecoder(protocol.deductionSources) });
    cursor.read(data, { key: "time", name: "TIME 日期及时间", length: 7, decode: bcdDateTime });
    if (response) {
      cursor.read(data, { key: "gmac", name: "GMAC 解灰认证码", length: 4, decode: (raw) => decodeResult(bytesHex(raw)) });
      cursor.read(data, { key: "psam-tid", name: "PSAM-TID 编号", length: 6, decode: (raw) => decodeResult(bytesHex(raw)) });
      cursor.read(data, { key: "psam-ttc", name: "PSAM-TTC 交易号", length: 4, decode: (raw) => decodeResult(unsignedText(raw)) });
    }
    groups.push(data);
    addTrailingData(cursor, groups);
    return response ? "PC 机回复灰卡查询结果" : "加油机申请解灰";
  }

  function parse36(cursor, groups, length) {
    const response = length > 11;
    const data = group("list-query", response ? "黑白名单查询结果" : "黑白名单查询");
    addCommand(cursor, data, response ? "PC 机回复黑白名单查询结果" : "加油机申请查询黑白名单");
    if (response) cursor.read(data, { key: "match", name: "M-FLAG 匹配标志", length: 1, decode: (raw) => decodeResult((raw[0] & 1) === 0 ? "匹配" : "不匹配", `b0=${raw[0] & 1}`) });
    readAsn(cursor, data, "asn");
    groups.push(data);
    addTrailingData(cursor, groups);
    return response ? "PC 机回复黑白名单查询结果" : "加油机申请查询黑白名单";
  }

  function parse38(cursor, groups, length) {
    const response = length > 1;
    const header = group("totals-header", response ? "累计数概要" : "读取累计数");
    addCommand(cursor, header, response ? "加油机上送累计数" : "PC 机读取加油累计数");
    if (!response) {
      groups.push(header);
      return "PC 机读取加油累计数";
    }
    const countRaw = cursor.read(header, { key: "gun-count", name: "GUN-N 油枪数", length: 1, decode: (raw) => decodeResult(unsignedText(raw)) });
    groups.push(header);
    const count = countRaw[0] || 0;
    for (let index = 0; index < count; index += 1) {
      const item = group(`total-${index + 1}`, `油枪累计 ${index + 1}`);
      cursor.read(item, { key: `gun-${index}`, name: "NZN 枪号", length: 1, decode: (raw) => decodeResult(unsignedText(raw)) });
      cursor.read(item, { key: `volume-total-${index}`, name: "V-TOT 升累计", length: 4, decode: (raw) => decodeResult(scaledText(raw, "升", 100), "单位 0.01 升") });
      groups.push(item);
    }
    addTrailingData(cursor, groups);
    return "加油机上送累计数";
  }

  function parse3A(cursor, groups, length) {
    const response = length > 1;
    const info = group("machine-info", response ? "加油机与站点信息" : "读取加油机信息");
    addCommand(cursor, info, response ? "加油机上送加油机信息" : "PC 机读取加油机信息");
    if (!response) {
      groups.push(info);
      return "PC 机读取加油机信息";
    }
    cursor.read(info, { key: "manufacturer", name: "M-INFO 厂家信息", length: 12, decode: (raw) => decodeResult(asciiText(raw), "ASCII，前对齐后补空格") });
    cursor.read(info, { key: "province", name: "Prov 省代码", length: 1, decode: (raw) => { const result = bcdDigits(raw); return decodeResult(result.value, "石化地区编码前两位", result.warnings); } });
    cursor.read(info, { key: "city", name: "City 地市代码", length: 1, decode: (raw) => { const result = bcdDigits(raw); return decodeResult(result.value, "石化地区编码中间两位", result.warnings); } });
    cursor.read(info, { key: "superior", name: "Superior 上级单位代码", length: 4, decode: (raw) => { const result = bcdDigits(raw); return decodeResult(result.value, "石化编码", result.warnings); } });
    cursor.read(info, { key: "station-id", name: "S-ID 加油站 ID", length: 4, decode: (raw) => { const result = bcdDigits(raw); return decodeResult(result.value, "石化编码", result.warnings); } });
    cursor.read(info, { key: "time", name: "TIME 加油机时间", length: 7, decode: bcdDateTime });
    const countRaw = cursor.read(info, { key: "gun-count", name: "GUN-N 油枪数", length: 1, decode: (raw) => decodeResult(unsignedText(raw)) });
    groups.push(info);

    const guns = group("machine-guns", "油枪逻辑编号");
    const count = countRaw[0] || 0;
    for (let index = 0; index < count; index += 1) {
      cursor.read(guns, { key: `gun-${index}`, name: `NZN ${index + 1} 枪号`, length: 1, decode: (raw) => decodeResult(unsignedText(raw)) });
    }
    if (guns.fields.length) groups.push(guns);

    const versions = group("machine-versions", "数据版本");
    cursor.read(versions, { key: "base-black-version", name: "BL_VER 基础黑名单版本", length: 2, decode: (raw) => decodeResult(unsignedText(raw)) });
    [
      ["add-black-version", "ADD_BL_VER 新增黑名单版本"],
      ["delete-black-version", "DEL_BL_VER 新删黑名单版本"],
      ["white-version", "WH_VER 白名单版本"],
      ["price-version", "PRC_VER 油品油价版本"],
      ["station-version", "Sta_VER 油站通用信息版本"],
    ].forEach(([key, name]) => cursor.read(versions, { key, name, length: 1, decode: (raw) => decodeResult(unsignedText(raw), raw[0] === 0 ? "0 表示数据无效" : "") }));
    groups.push(versions);
    if (cursor.remaining()) {
      const custom = group("manufacturer-data", "厂家自定义数据");
      cursor.read(custom, { key: "manufacturer-data", name: "M-DATA 厂家自定义数据", length: cursor.remaining(), decode: (raw) => decodeResult(bytesHex(raw), "协议未定义内部结构") });
      groups.push(custom);
    }
    return "加油机上送加油机信息";
  }

  function parse3B(cursor, groups) {
    const info = group("internal-error", "加油机内部错误信息");
    addCommand(cursor, info, "加油机内部出错命令");
    const typeRaw = cursor.read(info, { key: "info-type", name: "INFO-TYPE 信息类别", length: 1, decode: (raw) => decodeResult(raw[0] & 1 ? "需要厂家解释" : "ASCII 文本", `b0=${raw[0] & 1}`) });
    const isAscii = ((typeRaw[0] || 0) & 1) === 0;
    if (cursor.remaining()) cursor.read(info, { key: "error-data", name: "DATA 错误数据", length: cursor.remaining(), decode: (raw) => decodeResult(isAscii ? asciiText(raw) : bytesHex(raw), isAscii ? "ASCII 错误说明" : "需按厂家定义解释") });
    groups.push(info);
    return "加油机内部出错命令";
  }

  function parse3C(cursor, groups) {
    const confirm = group("communication-confirm", "通信接收确认");
    addCommand(cursor, confirm, "通信接收确认命令");
    cursor.read(confirm, { key: "confirmed-command", name: "COMMAND 被确认命令", length: 1, decode: (raw) => { const command = protocol.commandInfo(raw[0]); return decodeResult(`${byteHex(raw[0] || 0)}H`, command.name); } });
    cursor.read(confirm, { key: "success", name: "FLAG 成功标志", length: 1, decode: (raw) => decodeResult((raw[0] & 1) === 0 ? "接收无误" : "通信错误", `b0=${raw[0] & 1}`) });
    groups.push(confirm);
    addTrailingData(cursor, groups);
    return "通信接收确认命令";
  }

  function parseRecordLookup(cursor, groups, found) {
    const record = group("record-lookup", found ? "读取加油记录" : "未找到加油记录");
    addCommand(cursor, record, found ? "PC 机主动读取加油记录" : "加油机无相应记录回应");
    cursor.read(record, { key: "pos-ttc", name: "POS-TTC 终端交易号", length: 4, decode: (raw) => decodeResult(unsignedText(raw)) });
    groups.push(record);
    addTrailingData(cursor, groups);
    return found ? "PC 机主动读取加油记录" : "加油机无相应记录回应";
  }

  function parseUnknown(cursor, groups, code, info) {
    const unknown = group("unknown", info.name);
    addCommand(cursor, unknown, info.description);
    if (cursor.remaining()) cursor.read(unknown, { key: "raw-payload", name: "S-DATA 原始有效数据", length: cursor.remaining(), decode: (raw) => decodeResult(bytesHex(raw), info.description) });
    groups.push(unknown);
    return info.name;
  }

  function parsePayloadV1(frame) {
    const payload = Array.from((frame && frame.payload) || []);
    const diagnostics = [];
    const groups = [];
    const code = payload[0];
    const info = protocol.commandInfo(code);
    const cursor = new PayloadCursor(payload, diagnostics);
    let variant;

    if (code === undefined) {
      diagnostics.push({ level: "error", message: "有效数据为空，无法读取命令字。" });
      return { code: null, codeHex: "--", name: "无命令字", description: "", variant: "无命令字", groups, diagnostics, isLong: false };
    }

    switch (code) {
      case 0x30: variant = parse30(cursor, groups, payload.length); break;
      case 0x31: variant = parse31(cursor, groups); break;
      case 0x32: variant = parse32(cursor, groups, payload.length, frame); break;
      case 0x33: variant = parse33(cursor, groups, payload.length); break;
      case 0x34: variant = parse34(cursor, groups, payload.length); break;
      case 0x35: variant = parse35(cursor, groups, payload.length); break;
      case 0x36: variant = parse36(cursor, groups, payload.length); break;
      case 0x38: variant = parse38(cursor, groups, payload.length); break;
      case 0x3a: variant = parse3A(cursor, groups, payload.length); break;
      case 0x3b: variant = parse3B(cursor, groups); break;
      case 0x3c: variant = parse3C(cursor, groups); break;
      case 0x3e: variant = parseRecordLookup(cursor, groups, true); break;
      case 0x3f: variant = parseRecordLookup(cursor, groups, false); break;
      default: variant = parseUnknown(cursor, groups, code, info);
    }

    const expectedLengths = {
      0x30: [1, 17],
      0x32: [2, 96, 97],
      0x33: [4, 6],
      0x35: [25, 43],
      0x36: [11, 12],
      0x3c: [3],
      0x3e: [5],
      0x3f: [5],
    };
    if (expectedLengths[code] && !expectedLengths[code].includes(payload.length)) {
      diagnostics.unshift({
        level: "warning",
        message: `命令 ${byteHex(code)}H 的有效数据长度为 ${payload.length}，标准长度为 ${expectedLengths[code].join(" 或 ")} 字节。`,
      });
    }

    return {
      code,
      codeHex: byteHex(code),
      name: info.name,
      description: info.description,
      variant,
      groups,
      diagnostics,
      fieldCount: groups.reduce((total, item) => total + item.fields.length, 0),
      isLong: payload.length >= 40,
    };
  }

  function resolveProtocol(frame, options) {
    const requested = options && options.protocol;
    if (requested === "v1" || requested === "v19") return requested;
    const code = frame && frame.payload ? frame.payload[0] : undefined;
    if (code === undefined) return "v1";
    if (code >= 0x10 && code <= 0x2f) return "v19";
    if ((code >= 0x40 && code <= 0x4f) || code === 0x55) return "v19";
    if (code === 0x50 || code === 0x51) return frame.payload.length >= 56 ? "v19" : "v1";
    return "v1";
  }

  function parsePayload(frame, options) {
    const selected = resolveProtocol(frame, options);
    const parsed = selected === "v19" ? payloadParser19.parsePayload(frame) : parsePayloadV1(frame);
    return {
      ...parsed,
      protocol: selected,
      protocolVersion: selected === "v19" ? payloadParser19.version || "V1.00.011" : protocol.version,
      protocolLabel: selected === "v19" ? "19版" : "09版",
    };
  }

  function findField(parsed, key) {
    for (const item of parsed.groups || []) {
      const field = item.fields.find((candidate) => candidate.key === key);
      if (field) return field;
    }
    return null;
  }

  return {
    parsePayload,
    parsePayloadV1,
    resolveProtocol,
    findField,
    bcdDigits,
    bcdDate,
    bcdDateTime,
    unsignedBigInt,
    scaledText,
  };
});
