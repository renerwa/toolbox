(function (root, factory) {
  const protocol = typeof module === "object" && module.exports
    ? require("./protocol-19.js")
    : root.SinopecProtocol19;
  const frameUtils = typeof module === "object" && module.exports
    ? require("./frame-parser.js")
    : root.SinopecFrameParser;
  const api = factory(protocol, frameUtils);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SinopecPayloadParser19 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (protocol, frameUtils) {
  "use strict";

  const { byteHex, bytesHex } = frameUtils;

  function decodeResult(value, description, warnings) {
    return { value: String(value), description: description || "", warnings: warnings || [] };
  }

  function unsignedBigInt(bytes) {
    return Array.from(bytes || []).reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
  }

  function unsignedText(bytes) {
    if (!bytes || !bytes.length) return "-";
    return unsignedBigInt(bytes).toString(10);
  }

  function scaledText(bytes, unit, scale) {
    if (!bytes || !bytes.length) return "-";
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

  function bcdInteger(bytes) {
    const decoded = bcdDigits(bytes);
    return decodeResult(decoded.value || "-", "压缩 BCD", decoded.warnings);
  }

  function bcdDateTime(bytes) {
    const decoded = bcdDigits(bytes);
    if (decoded.warnings.length || decoded.value.length !== 14) {
      return { value: decoded.value || "-", description: "YYYYMMDDhhmmss", warnings: decoded.warnings.concat("日期时间格式应为 7 字节 BCD") };
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
      description: "YYYYMMDDhhmmss",
      warnings: valid ? [] : ["BCD 数字合法，但日期或时间范围无效"],
    };
  }

  function bcdDate(bytes) {
    const decoded = bcdDigits(bytes);
    if (decoded.value.length !== 8 || decoded.warnings.length) {
      return { value: decoded.value || "-", description: "YYYYMMDD", warnings: decoded.warnings };
    }
    return {
      value: `${decoded.value.slice(0, 4)}-${decoded.value.slice(4, 6)}-${decoded.value.slice(6, 8)}`,
      description: "YYYYMMDD",
      warnings: [],
    };
  }

  function bcdTime(bytes) {
    const decoded = bcdDigits(bytes);
    if (decoded.value.length !== 6 || decoded.warnings.length) {
      return { value: decoded.value || "-", description: "hhmmss", warnings: decoded.warnings };
    }
    return {
      value: `${decoded.value.slice(0, 2)}:${decoded.value.slice(2, 4)}:${decoded.value.slice(4, 6)}`,
      description: "hhmmss",
      warnings: [],
    };
  }

  function bcdDateRange(bytes) {
    if (!bytes || bytes.length !== 8) {
      return { value: bcdDigits(bytes).value || "-", description: "开始日期 YYYYMMDD + 截止日期 YYYYMMDD", warnings: ["有效期应为 8 字节 BCD"] };
    }
    const start = bcdDate(bytes.slice(0, 4));
    const end = bcdDate(bytes.slice(4, 8));
    return {
      value: `${start.value} 至 ${end.value}`,
      description: "开始日期至截止日期",
      warnings: start.warnings.concat(end.warnings),
    };
  }

  function trimmedBytes(bytes) {
    let end = (bytes || []).length;
    while (end > 0 && [0x00, 0x20, 0xff].includes(bytes[end - 1])) end -= 1;
    return Array.from(bytes || []).slice(0, end);
  }

  function asciiText(bytes) {
    const content = trimmedBytes(bytes);
    if (!content.length) return "（空）";
    return content.map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : "·")).join("");
  }

  function gbkText(bytes) {
    const content = trimmedBytes(bytes);
    if (!content.length) return "（空）";
    try {
      return new TextDecoder("gbk").decode(Uint8Array.from(content)).replace(/�/g, "·");
    } catch (error) {
      return bytesHex(content);
    }
  }

  function flowRateText(bytes) {
    const decoded = bcdDigits(bytes);
    if (decoded.warnings.length || decoded.value.length !== 6) {
      return {
        value: decoded.value || "-",
        description: "压缩 BCD，L/M",
        warnings: decoded.warnings.concat(decoded.value.length === 6 ? [] : ["流速应为 3 字节 BCD"]),
      };
    }
    const digits = decoded.value;
    return {
      value: `${Number(digits.slice(0, 4))}.${digits.slice(4)} L/M`,
      description: "压缩 BCD，两位小数",
      warnings: [],
    };
  }

  function productResult(raw) {
    const decoded = bcdDigits(raw);
    if (decoded.warnings.length) return decodeResult(decoded.value || "-", "油品代码", decoded.warnings);
    if (/^F{4}$/i.test(decoded.value)) return decodeResult("FFFF", "无油品限制");
    return decodeResult(decoded.value, protocol.productCodes[decoded.value] || "未列出的油品代码");
  }

  function amountResult(bytes, unit, description) {
    return decodeResult(scaledText(bytes, unit || "元", 100), description || "单位 0.01");
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

  function readFields(cursor, target, fields) {
    fields.forEach((field) => cursor.read(target, field));
  }

  const rawHex = (description) => (raw) => decodeResult(bytesHex(raw), description || "Hex");
  const unsigned = (description) => (raw) => decodeResult(unsignedText(raw), description || "无符号 Hex");
  const scaled = (unit, description) => (raw) => amountResult(raw, unit, description);
  const ascii = (description) => (raw) => decodeResult(asciiText(raw), description || "ASCII 文本");
  const gbk = (description) => (raw) => decodeResult(gbkText(raw), description || "GBK 文本");
  const bcd = (description) => (raw) => {
    const decoded = bcdDigits(raw);
    return decodeResult(decoded.value || "-", description || "压缩 BCD", decoded.warnings);
  };
  const enumDecoder = (table, description) => (raw) => {
    if (!raw.length) return decodeResult("-", description || "");
    const value = raw[0];
    const label = Object.prototype.hasOwnProperty.call(table, value) ? table[value] : "未知值";
    return decodeResult(`${byteHex(value)}H`, label, label === "未知值" ? ["协议未定义该枚举值"] : []);
  };

  function parsePoll(cursor, groups) {
    const header = group("poll", "轮询信息");
    const variant = "加油机轮询";
    addCommand(cursor, header, variant);
    const countRaw = cursor.read(header, { key: "gun-count", name: "Gun_num 枪数", length: 1, decode: unsigned("本帧包含的枪数") });
    const count = countRaw[0] || 0;
    groups.push(header);
    for (let index = 0; index < count; index += 1) {
      if (cursor.remaining() < 3) {
        cursor.diagnostics.push({ level: "error", message: `第 ${index + 1} 把枪的状态数据不完整。` });
        break;
      }
      const item = group(`poll-gun-${index + 1}`, `枪 ${index + 1} 状态`);
      cursor.read(item, { key: `gun-${index}`, name: "Gun_n 枪号", length: 1, decode: unsigned("逻辑枪号") });
      cursor.read(item, { key: `work-state-${index}`, name: "Work_mode_n_0 上下班状态", length: 1, decode: enumDecoder(protocol.workStates, "0 下班 / 1 上班") });
      cursor.read(item, { key: `auth-mode-${index}`, name: "Work_mode_n_1 授权模式", length: 1, decode: enumDecoder(protocol.authorizeModes, "0 前庭 / 1 后台") });
      groups.push(item);
    }
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseVerInfo(cursor, groups) {
    const item = group("ver-info", "轮询应答信息");
    const variant = "轮询应答";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "pc-time", name: "PC_TIME EPS 时间", length: 7, decode: bcdDateTime },
      { key: "base-black-version", name: "BL_VER 基础黑名单版本", length: 2, decode: (raw) => decodeResult(unsignedText(raw), raw.every((value) => value === 0) ? "0 表示数据无效" : "0–65535") },
      { key: "add-black-version", name: "ADD_BL_VER 新增黑名单版本", length: 1, decode: unsigned("0 表示数据无效") },
      { key: "delete-black-version", name: "DEL_BL_VER 新删黑名单版本", length: 1, decode: unsigned("0 表示数据无效") },
      { key: "white-version", name: "WH_VER 白名单版本", length: 1, decode: unsigned("0 表示数据无效") },
      { key: "price-version", name: "PRC_VER 油品油价版本", length: 1, decode: unsigned("0 表示数据无效") },
      { key: "station-version", name: "Sta_VER 油站通用信息版本", length: 1, decode: unsigned("0 表示数据无效") },
      { key: "receipt-version", name: "SELF_D_VER 打印机凭条信息版本", length: 1, decode: unsigned("0 表示没有凭条信息") },
      { key: "software-flag", name: "SOFT_FLAG 程序更新标志", length: 1, decode: (raw) => decodeResult(raw[0] === 0 ? "无数据" : raw[0] === 1 ? "有新的程序需要下载" : String(raw[0]), "0 无数据 / 1 有新的程序") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseRealtime(cursor, groups) {
    const header = group("realtime-header", "实时信息概要");
    const variant = "加油机实时数据";
    addCommand(cursor, header, variant);
    const countRaw = cursor.read(header, { key: "message-count", name: "COUNT 信息数量", length: 1, decode: unsigned("后续状态段数量") });
    const count = countRaw[0] || 0;
    groups.push(header);

    for (let index = 0; index < count; index += 1) {
      if (cursor.remaining() < 2) {
        cursor.diagnostics.push({ level: "error", message: `第 ${index + 1} 个实时信息段不完整。` });
        break;
      }
      const status = cursor.peek();
      const statusLabel = status === 0x01 ? "卡插入" : status === 0x02 ? "提枪加油中" : `状态 ${status}`;
      const item = group(`realtime-${index + 1}`, `实时信息 ${index + 1} · ${statusLabel}`);
      cursor.read(item, { key: `status-${index}`, name: "St 状态字", length: 1, decode: () => decodeResult(`${byteHex(status)}H`, statusLabel, status === 0x01 || status === 0x02 ? [] : ["协议只定义状态 01H 和 02H 的详细格式"]) });
      cursor.read(item, { key: `gun-${index}`, name: "NZN 枪号", length: 1, decode: unsigned("逻辑枪号") });

      if (status === 0x01) {
        const lengthRaw = cursor.read(item, { key: `card-length-${index}`, name: "LEN 卡信息数据长度", length: 1, decode: unsigned("ASN 至 IC_DATA 的总长度") });
        const cardLength = lengthRaw[0] || 0;
        if (cardLength < 16) {
          cursor.diagnostics.push({ level: "warning", message: `第 ${index + 1} 个卡信息段长度为 ${cardLength}，小于固定字段所需的 16 字节。` });
        }
        const available = Math.min(cardLength, cursor.remaining());
        const start = cursor.pos;
        cursor.read(item, { key: `asn-${index}`, name: "ASN 卡应用号", length: Math.min(10, available), decode: bcd("右对齐，前补 0；全 0 表示无卡") });
        const afterAsn = cursor.pos - start;
        cursor.read(item, { key: `card-status-${index}`, name: "CardSt 卡状态", length: Math.min(2, Math.max(available - afterAsn, 0)), decode: (raw) => { const result = bcdDigits(raw); return decodeResult(result.value, protocol.cardStatusCodes[result.value] || "协议未列出的卡状态", result.warnings); } });
        const afterStatus = cursor.pos - start;
        cursor.read(item, { key: `balance-${index}`, name: "BAL 余额", length: Math.min(4, Math.max(available - afterStatus, 0)), decode: scaled("元", "单位 0.01 元") });
        const used = cursor.pos - start;
        const icLength = Math.max(Math.min(cardLength - used, cursor.remaining()), 0);
        if (icLength) cursor.read(item, { key: `ic-data-${index}`, name: "IC_DATA 卡片信息", length: icLength, decode: rawHex("变长卡片数据") });
        if (cardLength > available) cursor.diagnostics.push({ level: "error", message: `第 ${index + 1} 个卡信息段声明 ${cardLength} 字节，实际只剩 ${available} 字节。` });
      } else if (status === 0x02) {
        cursor.read(item, { key: `asn-${index}`, name: "ASN 卡应用号", length: 10, decode: bcd("右对齐，前补 0；全 0 表示无卡") });
        const unitRaw = cursor.read(item, { key: `unit-${index}`, name: "P_UNIT 结算单位/方式", length: 1, decode: (raw) => {
          const value = raw[0] || 0;
          const unit = value & 0x03;
          const method = value >>> 4;
          return decodeResult(`${byteHex(value)}H`, `${unit === 0 ? "金额（分）" : unit === 1 ? "积分（0.01 点）" : `保留单位 ${unit}`} / ${protocol.settlementMethods[method] || `方式 ${method}`}`, unit > 1 ? ["协议未定义该结算单位"] : []);
        } });
        const unitCode = (unitRaw[0] || 0) & 0x03;
        const amountUnit = unitCode === 0 ? "元" : unitCode === 1 ? "点" : "单位";
        readFields(cursor, item, [
          { key: `amount-${index}`, name: "AMN 数额", length: 3, decode: scaled(amountUnit, unitCode === 0 ? "单位 0.01 元" : unitCode === 1 ? "单位 0.01 点" : "按保留单位显示") },
          { key: `volume-${index}`, name: "VOL 升数", length: 3, decode: scaled("升", "单位 0.01 升") },
          { key: `price-${index}`, name: "PRC 价格", length: 2, decode: scaled("元/升", "单位 0.01 元/升") },
          { key: `nozzle-up-${index}`, name: "NozUp 提枪时间", length: 7, decode: bcdDateTime },
          { key: `valve-open-${index}`, name: "ValveOpen 电磁阀开阀时间", length: 7, decode: bcdDateTime },
          { key: `valve-close-${index}`, name: "ValveClose 电磁阀关阀时间", length: 7, decode: bcdDateTime },
          { key: `nozzle-down-${index}`, name: "NozDown 挂枪时间", length: 7, decode: bcdDateTime },
          { key: `avg-flow-${index}`, name: "AvrFlowrate 平均流速", length: 3, decode: flowRateText },
          { key: `max-flow-${index}`, name: "MaxFlowrate 最大流速", length: 3, decode: flowRateText },
          { key: `sale-type-${index}`, name: "Type 定量方式", length: 1, decode: enumDecoder(protocol.saleTypes, "0 定量 / 1 定额 / 2 随意") },
        ]);
      }
      groups.push(item);
      if (status !== 0x01 && status !== 0x02) break;
    }
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseAuthReq1(cursor, groups) {
    const item = group("auth-req1", "加油卡授权请求");
    const variant = "加油卡授权请求";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("逻辑枪号") },
      { key: "pos-ttc", name: "POS-TTC 交易流水号", length: 4, decode: unsigned("贯穿本笔交易") },
      { key: "dispenser-time", name: "Dispenser_TIME 加油机时间", length: 7, decode: bcdDateTime },
      { key: "pay-method", name: "Pay_X 付款方式/地点", length: 1, decode: enumDecoder(protocol.payMethods, "付款方式与地点") },
      { key: "price", name: "PRC 价格", length: 2, decode: scaled("元/升", "单位 0.01 元/升") },
      { key: "balance", name: "BAL 卡钱包余额", length: 4, decode: scaled("元", "卡电子油票或积分优惠余额") },
      { key: "add-ons", name: "Add-ons 卡附加信息", length: 30, decode: rawHex("卡限制信息区域备用字段") },
      { key: "pin-block", name: "PIN_block 联机 PIN 数据", length: 16, decode: rawHex("PSAM 卡号右 8 字节 + PIN 密文 8 字节") },
      { key: "amount", name: "AMN 请求授权金额", length: 3, decode: scaled("元", "单位 0.01 元；与 VOL 二选一") },
      { key: "volume", name: "VOL 请求授权升数", length: 3, decode: scaled("升", "单位 0.01 升；与 AMN 二选一") },
      { key: "asn", name: "ASN 卡号", length: 10, decode: bcd("右对齐，前补 0") },
      { key: "vehicle-plate", name: "VehiclePlate 车号", length: 16, decode: (raw) => decodeResult(raw.every((value) => value === 0xff) ? "无限制" : asciiText(raw), "全 FFH 表示无限制，其余为 ASCII") },
      { key: "limit-grade", name: "LimitGrade 卡内限油品编码", length: 2, decode: productResult },
      { key: "mac", name: "MAC 消息鉴别码", length: 4, decode: rawHex("石化 PSAM 卡计算，取左 4 字节") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseAuthReq2(cursor, groups, code) {
    const item = group(code === 0x2d ? "auth-req3" : "auth-req2", code === 0x2d ? "其他（非卡）授权请求" : "员工作业卡授权请求");
    const variant = code === 0x2d ? "其他（非卡）授权请求" : "员工作业卡授权请求";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("逻辑枪号") },
      { key: "pos-ttc", name: "POS-TTC 交易流水号", length: 4, decode: unsigned("贯穿本笔交易") },
      { key: "dispenser-time", name: "Dispenser_TIME 加油机时间", length: 7, decode: bcdDateTime },
      { key: "pay-method", name: "Pay_X 付款方式/地点", length: 1, decode: enumDecoder(protocol.payMethods, "付款方式与地点") },
      { key: "price", name: "PRC 价格", length: 2, decode: scaled("元/升", "单位 0.01 元/升") },
      { key: "amount", name: "AMN 请求授权金额", length: 3, decode: scaled("元", "单位 0.01 元；与 VOL 二选一") },
      { key: "volume", name: "VOL 请求授权升数", length: 3, decode: scaled("升", "单位 0.01 升；与 AMN 二选一") },
      { key: code === 0x2d ? "otn" : "asn", name: code === 0x2d ? "OTN 条码号" : "ASN 员工作业卡卡号", length: 10, decode: bcd(code === 0x2d ? "条码号不足左补 0" : "右对齐，前补 0") },
      { key: "mac", name: "MAC 消息鉴别码", length: 4, decode: rawHex("石化 PSAM 卡计算，取左 4 字节") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseAuthFb(cursor, groups) {
    const item = group("auth-fb", "授权请求结果");
    const variant = "授权请求结果";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("逻辑枪号") },
      { key: "pos-ttc", name: "POS-TTC 交易流水号", length: 4, decode: unsigned("原授权申请流水号；0 表示后台发起授权") },
      { key: "pay-method", name: "Pay_X 付款方式/地点", length: 1, decode: enumDecoder(protocol.payMethods, "授权允许的付款方式与地点") },
      { key: "price", name: "PRC 价格", length: 2, decode: scaled("元/升", "单位 0.01 元/升") },
    ]);
    const lengthRaw = cursor.read(item, { key: "add-in-length", name: "Add_in_L 授权附加信息字节数", length: 1, decode: unsigned("Add_in 的字节数") });
    cursor.read(item, { key: "add-in", name: "Add_in 授权附加信息", length: lengthRaw[0] || 0, decode: gbk("授权失败原因，支持汉字") });
    readFields(cursor, item, [
      { key: "amount", name: "AMN 授权金额", length: 3, decode: scaled("元", "后台按账户余额折算") },
      { key: "asn", name: "ASN 卡号", length: 10, decode: bcd("右对齐，前补 0") },
      { key: "auth-result", name: "Auth_Fb 返回状态字", length: 1, decode: enumDecoder(protocol.authResults, "授权结果") },
      { key: "mac", name: "MAC 消息鉴别码", length: 4, decode: rawHex("石化 PSAM 卡计算，取左 4 字节") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseAuthMode(cursor, groups) {
    const item = group("auth-mode", "授权模式切换");
    const variant = "授权模式切换";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "gun", name: "NZN 枪号", length: 1, decode: (raw) => decodeResult(unsignedText(raw), raw[0] === 0 ? "0 表示所有枪" : "指定枪号") },
      { key: "auth-mode", name: "Auth_Mode 授权模式", length: 1, decode: enumDecoder(protocol.authModes, "授权模式") },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseStop(cursor, groups) {
    const item = group("stop", "停止命令");
    const variant = "停止命令";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "gun", name: "NZN 枪号", length: 1, decode: (raw) => decodeResult(unsignedText(raw), raw[0] === 0 ? "0 表示停止整个 POS-P 活动枪任务" : "指定枪号") },
      { key: "pos-ttc", name: "POS-TTC 交易流水号", length: 4, decode: unsigned("原授权申请流水号；0 表示后台发起授权") },
      { key: "stop-time", name: "STOP_TIME 停止时间", length: 7, decode: bcdDateTime },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseNozzleDown(cursor, groups) {
    const item = group("nozzle-down", "加油数据");
    const variant = "加油机提交加油数据";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("逻辑枪号") },
      { key: "pos-ttc", name: "POS-TTC 交易流水号", length: 4, decode: unsigned("原授权请求流水号；0 表示后台授权") },
      { key: "dispenser-time", name: "Dispenser_TIME 加油机时间", length: 7, decode: bcdDateTime },
      { key: "product-code", name: "G-CODE 油品代码", length: 2, decode: productResult },
      { key: "pay-method", name: "Pay_X 付款方式/地点", length: 1, decode: enumDecoder(protocol.payMethods, "付款方式与地点") },
      { key: "price", name: "PRC 价格", length: 2, decode: scaled("元/升", "单位 0.01 元/升") },
      { key: "ctc", name: "CTC 卡交易流水", length: 2, decode: rawHex("对卡做零扣款形成的 CTC") },
      { key: "volume-total", name: "V-TOT 升累计", length: 4, decode: scaled("升", "单位 0.01 升") },
      { key: "amount", name: "AMN 金额", length: 3, decode: scaled("元", "支付基础数据") },
      { key: "volume", name: "VOL 升数", length: 3, decode: scaled("升", "参考数据") },
      { key: "asn", name: "ASN 卡号", length: 10, decode: bcd("右对齐，前补 0") },
      { key: "mac", name: "MAC 消息鉴别码", length: 4, decode: rawHex("石化 PSAM 卡计算，取左 4 字节") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parsePaymentData(cursor, groups) {
    const item = group("payment-data", "支付数据");
    const variant = "支付数据";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("逻辑枪号") },
      { key: "pos-ttc", name: "POS-TTC 交易流水号", length: 4, decode: unsigned("原授权请求流水号；0 表示后台授权") },
      { key: "pay-method", name: "Pay_X 付款方式/地点", length: 1, decode: enumDecoder(protocol.payMethods, "前庭或室内支付方式") },
      { key: "amount-due", name: "AMN_D 加油金额（应付）", length: 3, decode: scaled("元", "单位 0.01 元") },
      { key: "amount-pay1", name: "AMN_T1 交易金额 1（实付）", length: 3, decode: scaled("元", "加油卡扣款或作业卡现金；不用时填 0") },
      { key: "amount-pay2", name: "AMN_T2 交易金额 2（实付）", length: 3, decode: scaled("元", "联机备付金或其它非卡支付；不用时填 0") },
      { key: "discount-no", name: "Discount_No 优惠规则代码", length: 2, decode: rawHex("无意义时为 0000H") },
      { key: "asn", name: "ASN 卡应用号", length: 10, decode: bcd("右对齐，前补 0") },
      { key: "mac", name: "MAC 消息鉴别码", length: 4, decode: rawHex("石化 PSAM 卡计算") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parsePriceChange(cursor, groups) {
    const header = group("price-change", "变价信息");
    const variant = "变价命令";
    addCommand(cursor, header, variant);
    const countRaw = cursor.read(header, { key: "price-count", name: "P_Number 记录数", length: 1, decode: unsigned("本次下发的价格条数，范围 1–8") });
    cursor.read(header, { key: "fs-time", name: "FS_Time FS 时间", length: 7, decode: rawHex("协议标注为 7 字节 Hex") });
    const count = countRaw[0] || 0;
    groups.push(header);
    for (let index = 0; index < count; index += 1) {
      if (cursor.remaining() < 5) {
        cursor.diagnostics.push({ level: "error", message: `第 ${index + 1} 条变价记录不完整。` });
        break;
      }
      const item = group(`price-${index + 1}`, `变价记录 ${index + 1}`);
      cursor.read(item, { key: `gun-${index}`, name: "NZN 枪号", length: 1, decode: unsigned("逻辑枪号") });
      cursor.read(item, { key: `new-price-${index}`, name: "PRC_New 新价格", length: 2, decode: scaled("元/升", "单位 0.01 元/升") });
      cursor.read(item, { key: `old-price-${index}`, name: "PRC_Old 原价格", length: 2, decode: scaled("元/升", "单位 0.01 元/升") });
      groups.push(item);
    }
    if (cursor.remaining()) {
      cursor.read(header, { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("NZN1 至 PRC_Old n 的 MAC") });
    }
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseCbRecord(cursor, groups) {
    const item = group("cb-record", "回叫交易数据");
    const variant = "回叫交易数据";
    addCommand(cursor, item, variant);
    cursor.read(item, { key: "pos-ttc", name: "POS-TTC 原交易流水", length: 4, decode: unsigned("要回叫的交易流水号") });
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseCardRecords(cursor, groups) {
    const header = group("card-record-header", "卡内交易明细");
    const variant = "加油卡内交易明细";
    addCommand(cursor, header, variant);
    cursor.read(header, { key: "asn", name: "ASN 卡应用号", length: 10, decode: bcd("右对齐，前补 0") });
    const countRaw = cursor.read(header, { key: "record-no", name: "Record_No 记录条数/次数", length: 1, decode: (raw) => {
      const value = raw[0] || 0;
      return decodeResult(`${byteHex(value)}H`, `第 ${value >>> 4} 次传输，本次 ${value & 0x0f} 条`);
    } });
    const count = (countRaw[0] || 0) & 0x0f;
    groups.push(header);
    for (let index = 0; index < count; index += 1) {
      if (cursor.remaining() < 23) {
        cursor.diagnostics.push({ level: "error", message: `第 ${index + 1} 条卡内交易明细不完整。` });
      }
      const item = group(`card-record-${index + 1}`, `卡内交易明细 ${index + 1}`);
      readFields(cursor, item, [
        { key: `et-ttc-${index}`, name: "ET 联机或脱机交易序号", length: 2, decode: unsigned("交易序号") },
        { key: `overdraft-${index}`, name: "透支限额", length: 3, decode: scaled("元", "单位 0.01 元") },
        { key: `amount-${index}`, name: "交易金额", length: 4, decode: scaled("元", "单位 0.01 元") },
        { key: `transaction-type-${index}`, name: "交易类型标识", length: 1, decode: enumDecoder(protocol.transactionTypes, "卡内交易类型") },
        { key: `terminal-id-${index}`, name: "终端机编号", length: 6, decode: rawHex("终端机编号") },
        { key: `transaction-date-${index}`, name: "交易日期（终端）", length: 4, decode: bcdDate },
        { key: `transaction-time-${index}`, name: "交易时间（终端）", length: 3, decode: bcdTime },
      ]);
      groups.push(item);
    }
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseGrayDemand(cursor, groups) {
    const item = group("gray-demand", "灰记录查询");
    const variant = "灰记录查询";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "asn", name: "ASN 卡应用号", length: 10, decode: bcd("右对齐，前补 0") },
      { key: "balance", name: "BAL 余额", length: 4, decode: scaled("元", "实际卡余额") },
      { key: "ctc", name: "CTC 卡交易流水", length: 2, decode: rawHex("卡交易序号") },
      { key: "ds", name: "DS 扣卡来源", length: 1, decode: enumDecoder(protocol.dsSources, "扣款来源") },
      { key: "time", name: "TIME 时间及日期", length: 7, decode: bcdDateTime },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseGrayResult(cursor, groups) {
    const item = group("gray-result", "灰记录查询结果");
    const variant = "灰记录查询结果";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "match-flag", name: "M-FLAG 匹配标志", length: 1, decode: (raw) => decodeResult(`${byteHex(raw[0] || 0)}H`, (raw[0] || 0) === 0 ? "匹配" : "不匹配") },
      { key: "asn", name: "ASN 卡应用号", length: 10, decode: bcd("右对齐，前补 0") },
      { key: "balance", name: "BAL 余额", length: 4, decode: scaled("元", "灰记录余额") },
      { key: "amount", name: "AMN 交易额", length: 3, decode: scaled("元", "单位 0.01 元") },
      { key: "ctc", name: "CTC 卡交易流水", length: 2, decode: rawHex("卡交易序号") },
      { key: "ds", name: "DS 扣卡来源", length: 1, decode: enumDecoder(protocol.dsSources, "扣款来源") },
      { key: "time", name: "TIME 时间及日期", length: 7, decode: bcdDateTime },
      { key: "gmac", name: "GMAC 解灰认证码", length: 4, decode: rawHex("解灰认证码") },
      { key: "psam-tid", name: "PSAM-TID PSAM 应用编码", length: 6, decode: rawHex("PSAM 应用编码") },
      { key: "psam-ttc", name: "PSAM-TTC PSAM 交易序号", length: 4, decode: rawHex("PSAM 的 TTC") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseBwListCheck(cursor, groups) {
    const item = group("bwlist-check", "黑白名单查询");
    const variant = "黑白名单查询";
    addCommand(cursor, item, variant);
    cursor.read(item, { key: "asn", name: "ASN 卡应用号", length: 10, decode: bcd("右对齐，前补 0") });
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseBwListResult(cursor, groups) {
    const item = group("bwlist-result", "黑白名单查询结果");
    const variant = "黑白名单查询结果";
    addCommand(cursor, item, variant);
    cursor.read(item, { key: "match-flag", name: "M-FLAG 匹配标志", length: 1, decode: (raw) => {
      const value = raw[0] || 0;
      const labels = { 0: "匹配", 1: "不匹配", 2: "名单不可用" };
      return decodeResult(`${byteHex(value)}H`, labels[value] || "未知匹配状态", labels[value] ? [] : ["协议未定义该匹配标志"]);
    } });
    cursor.read(item, { key: "asn", name: "ASN 卡应用号", length: 10, decode: bcd("右对齐，前补 0") });
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseVtot(cursor, groups) {
    const header = group("vtot-header", "加油累计数");
    const variant = "加油累计数";
    addCommand(cursor, header, variant);
    const countRaw = cursor.read(header, { key: "gun-count", name: "GUN-N 油枪数", length: 1, decode: unsigned("后续枪累计记录数量") });
    const count = countRaw[0] || 0;
    groups.push(header);
    for (let index = 0; index < count; index += 1) {
      if (cursor.remaining() < 5) {
        cursor.diagnostics.push({ level: "error", message: `第 ${index + 1} 把枪的累计数不完整。` });
        break;
      }
      const item = group(`vtot-gun-${index + 1}`, `枪 ${index + 1} 升累计`);
      cursor.read(item, { key: `gun-${index}`, name: "NZN 枪号", length: 1, decode: unsigned("逻辑枪号") });
      cursor.read(item, { key: `total-${index}`, name: "V-TOT 升累计", length: 4, decode: scaled("升", "单位 0.01 升") });
      groups.push(item);
    }
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseReqData(cursor, groups) {
    const item = group("req-data", "请求下载数据");
    const variant = "请求下载数据";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "content", name: "Content 下载内容", length: 1, decode: enumDecoder(protocol.contentTypes, "数据文件类型") },
      { key: "base-black-version", name: "IBL-VER 基础黑名单版本", length: 2, decode: unsigned("下载增删黑名单时有效") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseDataBytes(cursor, groups) {
    const item = group("data-bytes", "下载数据总长度");
    const variant = "下载数据总长度";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "data-length", name: "BL-LEN 数据文件长度", length: 4, decode: unsigned("0–4294967295 字节；0 表示内容为空") },
      { key: "content", name: "Content 下载内容", length: 1, decode: enumDecoder(protocol.contentTypes, "数据文件类型") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseReqCont(cursor, groups) {
    const item = group("req-cont", "申请下载数据内容");
    const variant = "申请下载数据内容";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "content", name: "Content 下载内容", length: 1, decode: enumDecoder(protocol.contentTypes, "数据文件类型") },
      { key: "offset", name: "S-OFFSET 段偏移", length: 2, decode: unsigned("每段 16 字节") },
      { key: "segments", name: "SEG 段数", length: 1, decode: unsigned("数据长度为 SEG × 16 字节") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseDataCont(cursor, groups) {
    const item = group("data-cont", "下载数据内容");
    const variant = "下载数据内容";
    addCommand(cursor, item, variant);
    cursor.read(item, { key: "content", name: "Content 下载内容", length: 1, decode: enumDecoder(protocol.contentTypes, "数据文件类型") });
    cursor.read(item, { key: "offset", name: "S-OFFSET 段偏移", length: 2, decode: unsigned("每段 16 字节") });
    const countRaw = cursor.read(item, { key: "segments", name: "SEG 段数", length: 1, decode: unsigned("实际送出的段数") });
    const expected = (countRaw[0] || 0) * 16;
    const dataLength = Math.min(expected, cursor.remaining());
    cursor.read(item, { key: "data", name: "DATA-Content 数据内容", length: dataLength, decode: rawHex(`按 SEG × 16 计算为 ${expected} 字节；末段可短于声明长度`) });
    if (expected && dataLength < expected) {
      cursor.diagnostics.push({ level: "warning", message: `DATA-Content 声明 ${expected} 字节，实际只有 ${dataLength} 字节。` });
    }
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseDispenserInfo(cursor, groups) {
    const header = group("dispenser-info", "加油机信息");
    const variant = "加油机信息";
    addCommand(cursor, header, variant);
    readFields(cursor, header, [
      { key: "manufacturer", name: "M-INFO 厂家信息", length: 12, decode: ascii("前对齐，右补空格") },
      { key: "province", name: "Prov 省代号", length: 1, decode: bcd("石化地区编码") },
      { key: "city", name: "City 地市代码", length: 1, decode: bcd("石化地区编码") },
      { key: "superior", name: "Superior 上级单位代号", length: 4, decode: bcd("同石化编码") },
      { key: "station-id", name: "S-ID 加油站 ID", length: 4, decode: bcd("同石化编码") },
      { key: "dispenser-time", name: "TIME 加油机时间", length: 7, decode: bcdDateTime },
    ]);
    const countRaw = cursor.read(header, { key: "gun-count", name: "GUN-N 油枪数", length: 1, decode: unsigned("后续枪号数量") });
    const count = countRaw[0] || 0;
    for (let index = 0; index < count; index += 1) {
      cursor.read(header, { key: `gun-${index}`, name: `NZN ${index + 1} 枪号`, length: 1, decode: unsigned("逻辑枪号") });
    }
    readFields(cursor, header, [
      { key: "base-black-version", name: "BL_VER 基础黑名单版本", length: 2, decode: unsigned("0 表示不合法") },
      { key: "add-black-version", name: "ADD_BL_VER 新增黑名单版本", length: 1, decode: unsigned("0 表示不合法") },
      { key: "delete-black-version", name: "DEL_BL_VER 新删黑名单版本", length: 1, decode: unsigned("0 表示不合法") },
      { key: "white-version", name: "WH_VER 白名单版本", length: 1, decode: unsigned("0 表示不合法") },
      { key: "price-version", name: "PRC_VER 油品油价版本", length: 1, decode: unsigned("0 表示不合法") },
      { key: "station-version", name: "St_VER 油站通用信息版本", length: 1, decode: unsigned("0 表示不合法") },
    ]);
    groups.push(header);
    if (cursor.remaining()) {
      const vendor = group("vendor-data", "厂家自定义数据");
      cursor.read(vendor, { key: "vendor-data", name: "M-DATA 厂家自定义数据", length: cursor.remaining(), decode: rawHex("厂家自行定义") });
      groups.push(vendor);
    }
    return variant;
  }

  function parseErrorInfo(cursor, groups) {
    const item = group("error-info", "加油机内部错误");
    const variant = "加油机内部错误";
    addCommand(cursor, item, variant);
    const typeRaw = cursor.read(item, { key: "info-type", name: "INFO-TYPE 信息类别", length: 1, decode: (raw) => {
      const value = raw[0] || 0;
      return decodeResult(`${byteHex(value)}H`, (value & 1) === 0 ? "ASCII 错误说明" : "需要厂家解释", [`b0=${value & 1}`]);
    } });
    cursor.read(item, { key: "error-id", name: "ErrId 错误信息", length: 4, decode: bcd("错误代码") });
    cursor.read(item, { key: "error-message", name: "ErrMsg 错误内容", length: 100, decode: (typeRaw[0] & 1) === 0 ? gbk("GBK 错误说明") : rawHex("需按厂家定义解释") });
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseAuthBg(cursor, groups) {
    const item = group("auth-bg", "后台授权");
    const variant = "后台授权";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("逻辑枪号") },
      { key: "pos-ttc", name: "POS-TTC 交易流水号", length: 4, decode: (raw) => decodeResult(unsignedText(raw), raw.every((value) => value === 0) ? "0 表示后台发起授权" : "后台指定流水号") },
      { key: "auth-time", name: "Auth_Time 授权时间", length: 7, decode: bcdDateTime },
      { key: "pay-method", name: "Pay_X 付款方式/地点", length: 1, decode: enumDecoder(protocol.payMethods, "付款方式与地点") },
      { key: "operator", name: "POS_Operator-No POS 操作员号", length: 2, decode: bcd("不足位左补 0") },
      { key: "amount", name: "AMN 授权金额", length: 3, decode: scaled("元", "单位 0.01 元") },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function transactionTypeResult(raw) {
    const value = raw[0] || 0;
    const subtype = value & 0x0f;
    const parts = [protocol.transactionTypes[subtype] || `未知类型 ${subtype}`];
    if (value & 0x80) parts.push("卡错/出错");
    parts.push(value & 0x40 ? "离线本地查黑" : "在线后台查黑");
    parts.push(value & 0x20 ? "离线交易" : "在线交易");
    if (value & 0x10) parts.push("扣款签名有效");
    return decodeResult(`${byteHex(value)}H`, parts.join("；"));
  }

  function parseTransactionRecord(cursor, groups) {
    const header = group("transaction-header", "交易标识");
    const payment = group("transaction-payment", "金额、卡与油品");
    const process = group("transaction-process", "加油过程");
    const security = group("transaction-security", "认证与签名");
    const recordStart = cursor.pos;
    const unitByte = cursor.payload[recordStart + 64] || 0;
    const amountUnit = (unitByte & 0x03) === 0 ? "元" : "点";

    cursor.read(header, { key: "pos-ttc", name: "POS-TTC 交易流水号", length: 4, decode: unsigned("每笔交易自动加一") });
    cursor.read(header, { key: "transaction-type", name: "T-TYPE 交易类型", length: 1, decode: transactionTypeResult });
    cursor.read(header, { key: "transaction-time", name: "TIME 日期及时间", length: 7, decode: bcdDateTime });
    cursor.read(header, { key: "asn", name: "ASN 卡应用号", length: 10, decode: bcd("右对齐，前补 0") });

    cursor.read(payment, { key: "balance", name: "BAL 余额", length: 4, decode: scaled(amountUnit, "单位由 UNIT 决定") });
    cursor.read(payment, { key: "amount", name: "AMN 实付金额", length: 3, decode: scaled(amountUnit, "单位由 UNIT 决定") });
    cursor.read(payment, { key: "ctc", name: "CTC 卡交易序号", length: 2, decode: rawHex("卡交易序号") });
    cursor.read(payment, { key: "tac", name: "TAC 电子签名", length: 4, decode: rawHex("加油、补扣、补充为 TAC，逃卡为 GTAC") });
    cursor.read(payment, { key: "gmac", name: "GMAC 解灰认证码", length: 4, decode: rawHex("逃卡/错卡时有效") });
    cursor.read(payment, { key: "psam-tac", name: "PSAM-TAC 灰锁签名", length: 4, decode: rawHex("逃卡/错卡时有效") });
    cursor.read(payment, { key: "psam-asn", name: "PSAM-ASN PSAM 应用号", length: 10, decode: bcd("PSAM 卡号右 8 字节用于密钥分散") });
    cursor.read(payment, { key: "psam-tid", name: "PSAM-TID PSAM 编号", length: 6, decode: rawHex("用于 TAC/GTAC 运算") });
    cursor.read(payment, { key: "psam-ttc", name: "PSAM-TTC PSAM 交易序号", length: 4, decode: rawHex("签名以该序号为准") });
    cursor.read(payment, { key: "ds", name: "DS 扣款来源", length: 1, decode: enumDecoder(protocol.dsSources, "扣款来源") });
    cursor.read(payment, { key: "unit", name: "UNIT 结算单位/方式", length: 1, decode: (raw) => {
      const value = raw[0] || 0;
      const unit = value & 0x03;
      const method = value >>> 4;
      return decodeResult(`${byteHex(value)}H`, `${unit === 0 ? "金额（分）" : "点数（0.01 点）"} / ${protocol.settlementMethods[method] || `方式 ${method}`}`, []);
    } });
    cursor.read(payment, { key: "card-type", name: "C-TYPE 卡类", length: 1, decode: (raw) => {
      const value = raw[0] || 0;
      const labels = [value & 1 ? "POBC 金融卡" : "石化规范卡", value & 2 ? "虚拟卡" : "实体卡"];
      return decodeResult(`${byteHex(value)}H`, labels.join("；"), []);
    } });
    cursor.read(payment, { key: "card-version", name: "VER 卡密钥版本", length: 1, decode: (raw) => {
      const value = raw[0] || 0;
      return decodeResult(`${byteHex(value)}H`, `密钥索引 ${value >>> 4}，密钥版本 ${value & 0x0f}`, []);
    } });
    cursor.read(payment, { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("逻辑枪号") });
    cursor.read(payment, { key: "product-code", name: "G-CODE 油品代码", length: 2, decode: productResult });
    cursor.read(payment, { key: "volume", name: "VOL 升数", length: 3, decode: scaled("升", "单位 0.01 升") });
    cursor.read(payment, { key: "price", name: "PRC 成交价格", length: 2, decode: scaled("元/升", "单位 0.01 元/升") });
    cursor.read(payment, { key: "employee", name: "EMP 员工号", length: 1, decode: (raw) => decodeResult(unsignedText(raw), (raw[0] || 0) === 255 ? "255 表示没有员工上班" : "员工号") });
    cursor.read(payment, { key: "volume-total", name: "V-TOT 升累计", length: 4, decode: scaled("升", "单位 0.01 升") });
    cursor.read(payment, { key: "amount-due", name: "AMN_D 应付金额", length: 3, decode: scaled(amountUnit, "交易附加数据 RFU80–82") });
    cursor.read(payment, { key: "pay-method", name: "Pay_X 支付方式/地点", length: 1, decode: enumDecoder(protocol.payMethods, "交易附加数据 RFU83") });
    cursor.read(payment, { key: "discount-no", name: "Discount_No 优惠规则代码", length: 2, decode: rawHex("交易附加数据 RFU84–85") });
    cursor.read(payment, { key: "overdraft", name: "AMD_O 过冲金额", length: 3, decode: scaled(amountUnit, "交易附加数据 RFU86–88") });
    cursor.read(payment, { key: "card-rating", name: "Card_rating 卡类型", length: 1, decode: rawHex("交易附加数据 RFU89") });
    cursor.read(payment, { key: "rfu-byte", name: "备用", length: 1, decode: rawHex("交易附加数据 RFU90") });

    cursor.read(process, { key: "nozzle-up", name: "NozUp 提枪时间", length: 7, decode: bcdDateTime });
    cursor.read(process, { key: "valve-open", name: "ValveOpen 电磁阀开阀时间", length: 7, decode: bcdDateTime });
    cursor.read(process, { key: "valve-close", name: "ValveClose 电磁阀关阀时间", length: 7, decode: bcdDateTime });
    cursor.read(process, { key: "nozzle-down", name: "NozDown 挂枪时间", length: 7, decode: bcdDateTime });
    cursor.read(process, { key: "avg-flow", name: "AvrFlowrate 平均流速", length: 3, decode: flowRateText });
    cursor.read(process, { key: "max-flow", name: "MaxFlowrate 最大流速", length: 3, decode: flowRateText });
    cursor.read(process, { key: "sale-type", name: "SettleType 定量方式", length: 1, decode: enumDecoder(protocol.saleTypes, "0 定量 / 1 定额 / 2 随意") });
    cursor.read(process, { key: "attendant", name: "attendant 服务员工号", length: 1, decode: unsigned("服务员工号") });
    cursor.read(process, { key: "payment-method", name: "PaymentMethod 标准收款方式", length: 8, decode: rawHex("标准收款方式") });
    cursor.read(process, { key: "uuid", name: "UUID 订单唯一码", length: 32, decode: ascii("默认以空格填充") });

    cursor.read(security, { key: "rfu1", name: "RFU1 预留字段", length: 24, decode: rawHex("预留字段") });
    cursor.read(security, { key: "terminal-mac", name: "T-MAC 终端数据认证码", length: 4, decode: rawHex("PBOC 标准 3DES，计算范围从 POS-TTC 开始") });

    groups.push(header, payment, process, security);
  }

  function parseTranData(cursor, groups, variant) {
    const item = group("tran-data", variant);
    addCommand(cursor, item, variant);
    groups.push(item);
    parseTransactionRecord(cursor, groups);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseSignIn(cursor, groups) {
    const item = group("sign-in", "加油机签到");
    const variant = "加油机签到";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "station-id", name: "StationID 油站编号", length: 4, decode: bcd("压缩 BCD") },
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("1–255") },
      { key: "brand-type", name: "MachinebBrandType 加油机品牌型号", length: 4, decode: bcd("加油机厂商 ID") },
      { key: "software-version", name: "SoftVersion 加油机软件版本号", length: 12, decode: ascii("xx.xx.xxx，右补空格") },
      { key: "machine-id", name: "MachineID 计量芯片 ID", length: 8, decode: bcd("压缩 BCD") },
      { key: "protocol-version", name: "ProtocolVersion 协议版本号", length: 12, decode: ascii("xx.xx.xxx，右补空格") },
      { key: "psam-asn", name: "PsamASN PSAM 卡号", length: 10, decode: rawHex("PSAM 卡号") },
      { key: "psam-validate", name: "PsamValidate PSAM 卡有效期", length: 4, decode: bcdDate },
      { key: "rfu", name: "RFU 预留", length: 10, decode: rawHex("预留字段") },
      { key: "mac", name: "MAC 签名", length: 4, decode: rawHex("命令字后数据的 MAC") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseSignInResult(cursor, groups) {
    const item = group("sign-in-result", "签到结果");
    const variant = "签到结果";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "station-id", name: "StationID 油站编号", length: 4, decode: bcd("压缩 BCD") },
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("1–255") },
      { key: "error-code", name: "ErrorCode 错误代码", length: 1, decode: (raw) => decodeResult(`${byteHex(raw[0] || 0)}H`, (raw[0] || 0) === 0 ? "签到成功" : "签到失败") },
      { key: "error-message", name: "ErrorMsg 错误信息", length: 50, decode: gbk("GBK 编码") },
      { key: "mac", name: "MAC", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseOnlineAuth(cursor, groups) {
    const item = group("online-auth", "在线申请授权");
    const variant = "在线申请授权";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "station-id", name: "StationID 油站编号", length: 4, decode: bcd("压缩 BCD") },
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("1–255") },
      { key: "product-code", name: "G_CODE 油品编码", length: 2, decode: productResult },
      { key: "amount", name: "AMN 加油金额", length: 3, decode: scaled("元", "单位 0.01 元") },
      { key: "volume", name: "VOL 加油量", length: 3, decode: scaled("升", "单位 0.01 升") },
      { key: "price", name: "PRC 单价", length: 2, decode: scaled("元/升", "单位 0.01 元/升") },
      { key: "asn", name: "ASN 卡号", length: 10, decode: rawHex("员工卡号，没有填 0") },
      { key: "ctc", name: "CTC 卡交易序号", length: 2, decode: rawHex("卡交易序号") },
      { key: "app-id", name: "AppID 应用 ID", length: 2, decode: bcd("默认为 0") },
      { key: "dispenser-time", name: "Dispenser_Time 当前时间", length: 7, decode: bcdDateTime },
      { key: "code-length", name: "IdCodeLen 授权码长度", length: 1, decode: unsigned("验证码明文长度") },
      { key: "identifying-code", name: "IdentifyingCode 授权码", length: 32, decode: rawHex("左对齐，右补 FF；加密上传") },
      { key: "password-length", name: "PasswordLen 密码长度", length: 1, decode: unsigned("数字密码明文长度") },
      { key: "password", name: "Password 密码", length: 32, decode: rawHex("最高 6 位，右补 FF；加密上传") },
      { key: "rfu", name: "RFU 预留", length: 10, decode: rawHex("预留字段") },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseOnlineAuthResult(cursor, groups) {
    const item = group("online-auth-result", "在线申请授权应答");
    const variant = "在线申请授权应答";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "station-id", name: "StationID 油站编号", length: 4, decode: bcd("压缩 BCD") },
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("1–255") },
      { key: "code-length", name: "IdCodeLen 授权码长度", length: 1, decode: unsigned("验证码明文长度") },
      { key: "identifying-code", name: "IdentifyingCode 授权码", length: 32, decode: rawHex("左对齐，右补 FF；加密上传") },
      { key: "app-id", name: "AppID 应用 ID", length: 2, decode: bcd("默认为 0") },
      { key: "authorized-amount", name: "AuthMoney 授权金额", length: 3, decode: scaled("元", "单位 0.01 元") },
      { key: "payment-method", name: "PayMethod 标准收款方式", length: 8, decode: rawHex("标准收款方式") },
      { key: "uuid", name: "UUID1 授权唯一码", length: 32, decode: rawHex("默认全 0") },
      { key: "license-required", name: "LicenseReq 校验车牌标识", length: 1, decode: (raw) => decodeResult(`${byteHex(raw[0] || 0)}H`, (raw[0] || 0) === 0 ? "不校验" : "校验车牌") },
      { key: "license-number", name: "LicenseNum 车牌号", length: 20, decode: gbk("汉字采用 GBK 编码") },
      { key: "rfu", name: "RFU 预留", length: 10, decode: rawHex("预留字段") },
      { key: "error-code", name: "ErrorCode 错误代码", length: 1, decode: (raw) => decodeResult(`${byteHex(raw[0] || 0)}H`, (raw[0] || 0) === 0 ? "成功" : "失败") },
      { key: "error-message", name: "ErrorMsg 错误信息", length: 50, decode: gbk("GBK 编码") },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseDebit(cursor, groups) {
    const item = group("debit", "上传加油结果");
    const variant = "上传加油结果";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "station-id", name: "StationID 油站 ID", length: 4, decode: bcd("压缩 BCD") },
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("1–255") },
      { key: "product-code", name: "G_CODE 油品编码", length: 2, decode: productResult },
      { key: "pos-ttc", name: "POSTTC 流水号", length: 4, decode: unsigned("与后台一致") },
      { key: "ctc", name: "CTC 卡交易序号", length: 2, decode: rawHex("与后台一致") },
      { key: "dispenser-time", name: "Dispenser_TIME 日期及时间", length: 7, decode: bcdDateTime },
      { key: "asn", name: "ASN 员工卡号", length: 10, decode: bcd("右对齐，前补 0") },
      { key: "uuid", name: "UUID 授权唯一码", length: 32, decode: rawHex("授权唯一码") },
      { key: "amount", name: "AMN 加油金额", length: 3, decode: scaled("元", "单位 0.01 元") },
      { key: "volume", name: "VOL 加油升数", length: 3, decode: scaled("升", "单位 0.01 升") },
      { key: "authorized-amount", name: "AuthMoney 授权金额", length: 3, decode: scaled("元", "单位 0.01 元") },
      { key: "app-id", name: "AppID 应用 ID", length: 2, decode: bcd("默认为 0") },
      { key: "price", name: "PRC 单价", length: 2, decode: scaled("元/升", "单位 0.01 元/升") },
      { key: "balance", name: "Bal 员工卡余额", length: 4, decode: scaled("元", "扣款前余额") },
      { key: "rfu", name: "RFU 预留", length: 10, decode: rawHex("预留备用") },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseDebitResult(cursor, groups) {
    const item = group("debit-result", "上传加油结果应答");
    const variant = "上传加油结果应答";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "station-id", name: "StationID 油站 ID", length: 4, decode: bcd("压缩 BCD") },
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("逻辑枪号") },
      { key: "pos-ttc", name: "POSTTC 流水号", length: 4, decode: unsigned("同请求报文") },
      { key: "app-id", name: "AppID 应用 ID", length: 2, decode: bcd("默认为 0") },
      { key: "amount", name: "AMN 实付金额", length: 3, decode: scaled("元", "单位 0.01 元") },
      { key: "error-code", name: "ErrorCode 错误代码", length: 1, decode: (raw) => decodeResult(`${byteHex(raw[0] || 0)}H`, (raw[0] || 0) === 0 ? "成功" : "失败") },
      { key: "error-message", name: "ErrorMsg 错误信息", length: 50, decode: gbk("GBK 编码") },
      { key: "invoice-url", name: "InvoiceURL 电子发票二维码", length: 100, decode: ascii("ASCII 电子发票二维码地址") },
      { key: "mac", name: "MAC", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseReverseAuth(cursor, groups) {
    const item = group("reverse-auth", "撤销授权请求");
    const variant = "撤销授权请求";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "station-id", name: "StationID 油站编号", length: 4, decode: bcd("压缩 BCD") },
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("1–255") },
      { key: "app-id", name: "AppID 应用 ID", length: 2, decode: bcd("默认为 0") },
      { key: "pos-ttc", name: "POSTTC 流水号", length: 4, decode: unsigned("同一条交易流水号不变") },
      { key: "uuid", name: "UUID 授权唯一码", length: 32, decode: rawHex("授权唯一码") },
      { key: "dispenser-time", name: "Dispenser_TIME 申请时间", length: 7, decode: bcdDateTime },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseReverseAuthResult(cursor, groups) {
    const item = group("reverse-auth-result", "撤销授权应答");
    const variant = "撤销授权应答";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "station-id", name: "StationID 油站 ID", length: 4, decode: bcd("压缩 BCD") },
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("逻辑枪号") },
      { key: "app-id", name: "AppID 应用 ID", length: 2, decode: bcd("默认为 0") },
      { key: "pos-ttc", name: "POSTTC 流水号", length: 4, decode: unsigned("同请求报文") },
      { key: "uuid", name: "UUID1 授权唯一码", length: 32, decode: rawHex("授权唯一码") },
      { key: "error-code", name: "ErrorCode 错误代码", length: 1, decode: (raw) => decodeResult(`${byteHex(raw[0] || 0)}H`, (raw[0] || 0) === 0 ? "匹配，撤销成功" : "不匹配") },
      { key: "error-message", name: "ErrorMsg 错误信息", length: 50, decode: gbk("GBK 编码") },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseBalanceQuery(cursor, groups) {
    const item = group("balance-query", "查询用户可用余额");
    const variant = "查询用户可用余额";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "node-id", name: "NodeID 网点编号", length: 4, decode: bcd("压缩 BCD") },
      { key: "operator", name: "OperatorNo 操作员号", length: 1, decode: unsigned("操作员号") },
      { key: "terminal", name: "TerminalNo 终端机号", length: 6, decode: bcd("压缩 BCD") },
      { key: "asn", name: "ASN 卡号", length: 10, decode: bcd("右对齐，前补 0") },
      { key: "app-no", name: "AppNo 应用", length: 1, decode: enumDecoder(protocol.appNames, "应用类型") },
      { key: "datetime", name: "DateTime 交易日期时间", length: 7, decode: bcdDateTime },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseBalanceResult(cursor, groups) {
    const item = group("balance-result", "查询用户可用余额应答");
    const variant = "查询用户可用余额应答";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "asn", name: "ASN 卡号", length: 10, decode: rawHex("卡号") },
      { key: "app-no", name: "AppNo 应用", length: 1, decode: enumDecoder(protocol.appNames, "应用类型") },
      { key: "balance", name: "Balance 账户可用余额", length: 4, decode: scaled("元", "账户可用余额") },
      { key: "key-index", name: "KeyIndex 卡片密钥索引", length: 1, decode: unsigned("密钥索引") },
      { key: "error-code", name: "ErrorCode 错误代码", length: 1, decode: (raw) => decodeResult(`${byteHex(raw[0] || 0)}H`, (raw[0] || 0) === 0 ? "成功" : "失败") },
      { key: "error-message", name: "ErrorMsg 错误信息", length: 50, decode: gbk("GBK 编码") },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseCredit(cursor, groups) {
    const item = group("credit", "请求圈存");
    const variant = "请求圈存";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "node-id", name: "NodeID 网点编号", length: 4, decode: bcd("压缩 BCD") },
      { key: "operator", name: "OperatorNo 操作员号", length: 1, decode: unsigned("操作员号") },
      { key: "terminal", name: "TerminalNo 终端机号", length: 6, decode: bcd("压缩 BCD") },
      { key: "datetime", name: "DateTime 交易日期时间", length: 7, decode: bcdDateTime },
      { key: "asn", name: "ASN 卡号", length: 10, decode: bcd("右对齐，前补 0") },
      { key: "app-no", name: "AppNo 应用", length: 1, decode: enumDecoder(protocol.appNames, "应用类型") },
      { key: "online-ctc", name: "OnLineCTC 联机交易序号", length: 2, decode: rawHex("联机交易序号") },
      { key: "ttc", name: "TTC 终端流水号", length: 3, decode: rawHex("终端流水号") },
      { key: "balance-before", name: "BBalance 交易前余额", length: 4, decode: scaled("元", "交易前余额") },
      { key: "random", name: "Random 随机数", length: 4, decode: rawHex("随机数") },
      { key: "mac1", name: "MAC1 卡片产生 MAC1", length: 4, decode: rawHex("卡片产生 MAC1") },
      { key: "key-version", name: "KerVer 卡片密钥版本", length: 1, decode: unsigned("卡片密钥版本") },
      { key: "key-index", name: "KeyIndex 卡片密钥索引", length: 1, decode: unsigned("卡片密钥索引") },
      { key: "amount", name: "Amount 本次交易金额", length: 4, decode: scaled("元", "本次交易金额") },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseCreditResult(cursor, groups) {
    const item = group("credit-result", "请求圈存应答");
    const variant = "请求圈存应答";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "error-code", name: "ErrorCode 错误代码", length: 1, decode: (raw) => decodeResult(`${byteHex(raw[0] || 0)}H`, (raw[0] || 0) === 0 ? "成功" : "失败") },
      { key: "error-message", name: "ErrorMsg 错误信息", length: 50, decode: gbk("GBK 编码") },
      { key: "asn", name: "ASN 卡号", length: 10, decode: rawHex("卡号") },
      { key: "app-no", name: "AppNo 应用", length: 1, decode: enumDecoder(protocol.appNames, "应用类型") },
      { key: "tid", name: "TID 终端机编号", length: 6, decode: rawHex("终端机编号") },
      { key: "transaction-type", name: "TTYPE 交易类型标识", length: 1, decode: enumDecoder(protocol.transactionTypes, "交易类型") },
      { key: "datetime", name: "DateTime 主机交易日期时间", length: 7, decode: bcdDateTime },
      { key: "mac2", name: "MAC2 交易验证码", length: 4, decode: rawHex("交易验证码") },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseExtend(cursor, groups) {
    const item = group("extend", "请求延长有效期");
    const variant = "请求延长有效期";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "node-id", name: "NodeID 网点编号", length: 4, decode: bcd("压缩 BCD") },
      { key: "operator", name: "OperatorNo 操作员号", length: 1, decode: unsigned("操作员号") },
      { key: "terminal", name: "TerminalNo 终端机号", length: 6, decode: bcd("压缩 BCD") },
      { key: "datetime", name: "DateTime 交易日期时间", length: 7, decode: bcdDateTime },
      { key: "asn", name: "ASN 卡号", length: 10, decode: bcd("右对齐，前补 0") },
      { key: "expired-date", name: "Expired_Date 延长前起止有效期", length: 8, decode: bcdDateRange },
      { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseExtendResult(cursor, groups) {
    const item = group("extend-result", "请求延长有效期应答");
    const variant = "请求延长有效期应答";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "error-code", name: "ErrorCode 错误代码", length: 1, decode: (raw) => decodeResult(`${byteHex(raw[0] || 0)}H`, (raw[0] || 0) === 0 ? "成功" : "失败") },
      { key: "error-message", name: "ErrorMsg 错误信息", length: 50, decode: gbk("GBK 编码") },
      { key: "asn", name: "ASN 卡号", length: 10, decode: rawHex("卡号") },
      { key: "expired-date", name: "Expired_Date 延长后起止有效期", length: 8, decode: bcdDateRange },
    ]);
    const lengthRaw = cursor.read(item, { key: "mac-data-length", name: "MAC_DATA_LEN 延长有效期指令长度", length: 1, decode: unsigned("MAC_DATA 字节数") });
    cursor.read(item, { key: "mac-data", name: "MAC_DATA 延长有效期指令", length: lengthRaw[0] || 0, decode: rawHex("按长度取值") });
    cursor.read(item, { key: "mac", name: "MAC 消息验证码", length: 4, decode: rawHex("消息验证码") });
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseFileRequest(cursor, groups) {
    const item = group("file-request", "请求下载文件");
    const variant = "请求下载文件";
    addCommand(cursor, item, variant);
    cursor.read(item, { key: "filename", name: "Content 文件名", length: 50, decode: ascii("ASCII 文件名") });
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseFileBytes(cursor, groups) {
    const item = group("file-bytes", "下载文件总长度");
    const variant = "下载文件总长度";
    addCommand(cursor, item, variant);
    cursor.read(item, { key: "file-length", name: "File-LEN 文件长度", length: 4, decode: unsigned("0–4294967295 字节；0 表示内容为空") });
    cursor.read(item, { key: "filename", name: "Content 文件名", length: 50, decode: ascii("ASCII 文件名") });
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseFileContRequest(cursor, groups) {
    const item = group("file-cont-request", "申请下载文件内容");
    const variant = "申请下载文件内容";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "filename", name: "Content 文件名", length: 50, decode: ascii("ASCII 文件名") },
      { key: "offset", name: "S-OFFSET 偏移", length: 4, decode: unsigned("文件偏移量") },
      { key: "segments", name: "SEG 本次下载内容长度", length: 1, decode: unsigned("数据长度为 SEG × 1024 字节") },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseFileCont(cursor, groups) {
    const item = group("file-cont", "下载文件内容");
    const variant = "下载文件内容";
    addCommand(cursor, item, variant);
    cursor.read(item, { key: "filename", name: "Content 文件名", length: 50, decode: ascii("ASCII 文件名") });
    cursor.read(item, { key: "offset", name: "S-OFFSET 偏移", length: 4, decode: unsigned("文件偏移量") });
    const countRaw = cursor.read(item, { key: "segments", name: "SEG 段数", length: 1, decode: unsigned("数据长度为 SEG × 1024 字节") });
    const expected = (countRaw[0] || 0) * 1024;
    const dataLength = Math.min(expected, cursor.remaining());
    cursor.read(item, { key: "data", name: "DATA-Content 文件内容", length: dataLength, decode: rawHex(`按 SEG × 1024 计算为 ${expected} 字节；末段可短于声明长度`) });
    if (expected && dataLength < expected) {
      cursor.diagnostics.push({ level: "warning", message: `文件内容声明 ${expected} 字节，实际只有 ${dataLength} 字节。` });
    }
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseCommandAck(cursor, groups) {
    const item = group("command-ack", "命令数据应答");
    const variant = "命令数据应答";
    addCommand(cursor, item, variant);
    readFields(cursor, item, [
      { key: "original-command", name: "Command 原命令字", length: 1, decode: (raw) => decodeResult(`${byteHex(raw[0] || 0)}H`, "被确认的原始命令字") },
      { key: "gun", name: "NZN 枪号", length: 1, decode: unsigned("无枪号填 00H") },
      { key: "result", name: "RESULT 应答命令状态", length: 1, decode: (raw) => {
        const value = raw[0] || 0;
        const label = protocol.commandResults[value] || (value >= 0x07 && value <= 0xf0 ? "备用" : "未知结果");
        return decodeResult(`${byteHex(value)}H`, label, protocol.commandResults[value] ? [] : ["协议未定义该应答状态"]);
      } },
    ]);
    groups.push(item);
    addTrailingData(cursor, groups);
    return variant;
  }

  function parseUnknown(cursor, groups, code, info) {
    const item = group("unknown", info.name);
    addCommand(cursor, item, info.description);
    if (cursor.remaining()) {
      cursor.read(item, { key: "raw-payload", name: "S-DATA 原始有效数据", length: cursor.remaining(), decode: rawHex(info.description) });
    }
    groups.push(item);
    return info.name;
  }

  function parsePayload(frame) {
    const payload = Array.from((frame && frame.payload) || []);
    const diagnostics = [];
    const groups = [];
    const code = payload[0];
    if (code === undefined) {
      diagnostics.push({ level: "error", message: "有效数据为空，无法读取命令字。" });
      return { code: null, codeHex: "--", name: "无命令字", description: "", variant: "无命令字", groups, diagnostics, isLong: false, protocol: "v19", protocolVersion: protocol.version };
    }

    const info = protocol.commandInfo(code);
    const cursor = new PayloadCursor(payload, diagnostics);
    let variant;

    switch (code) {
      case 0x10: variant = parsePoll(cursor, groups); break;
      case 0x11: variant = parseVerInfo(cursor, groups); break;
      case 0x12: variant = parseRealtime(cursor, groups); break;
      case 0x13: variant = parseAuthReq1(cursor, groups); break;
      case 0x14: variant = parseAuthReq2(cursor, groups, code); break;
      case 0x15: variant = parseAuthFb(cursor, groups); break;
      case 0x16: variant = parseAuthMode(cursor, groups); break;
      case 0x17: variant = parseStop(cursor, groups); break;
      case 0x18: variant = parseNozzleDown(cursor, groups); break;
      case 0x19: variant = parsePaymentData(cursor, groups); break;
      case 0x1a: variant = parsePriceChange(cursor, groups); break;
      case 0x1b: variant = parseCbRecord(cursor, groups); break;
      case 0x1d: variant = parseCardRecords(cursor, groups); break;
      case 0x1e: variant = parseGrayDemand(cursor, groups); break;
      case 0x1f: variant = parseGrayResult(cursor, groups); break;
      case 0x20: variant = parseBwListCheck(cursor, groups); break;
      case 0x21: variant = parseBwListResult(cursor, groups); break;
      case 0x22: {
        const item = group("vtot-request", "读取加油机累计数");
        addCommand(cursor, item, "读取加油机累计数");
        groups.push(item);
        addTrailingData(cursor, groups);
        variant = "读取加油机累计数";
        break;
      }
      case 0x23: variant = parseVtot(cursor, groups); break;
      case 0x24: variant = parseReqData(cursor, groups); break;
      case 0x25: variant = parseDataBytes(cursor, groups); break;
      case 0x26: variant = parseReqCont(cursor, groups); break;
      case 0x27: variant = parseDataCont(cursor, groups); break;
      case 0x28: {
        const item = group("dispenser-info-request", "读取加油机信息");
        addCommand(cursor, item, "读取加油机信息");
        groups.push(item);
        addTrailingData(cursor, groups);
        variant = "读取加油机信息";
        break;
      }
      case 0x29: variant = parseDispenserInfo(cursor, groups); break;
      case 0x2a: variant = parseErrorInfo(cursor, groups); break;
      case 0x2b: variant = parseAuthBg(cursor, groups); break;
      case 0x2c: variant = parseTranData(cursor, groups, "上传交易数据"); break;
      case 0x2d: variant = parseAuthReq2(cursor, groups, code); break;
      case 0x2f: variant = parseTranData(cursor, groups, "回送交易数据"); break;
      case 0x40: variant = parseSignIn(cursor, groups); break;
      case 0x41: variant = parseSignInResult(cursor, groups); break;
      case 0x42: variant = parseOnlineAuth(cursor, groups); break;
      case 0x43: variant = parseOnlineAuthResult(cursor, groups); break;
      case 0x44: variant = parseDebit(cursor, groups); break;
      case 0x45: variant = parseDebitResult(cursor, groups); break;
      case 0x46: variant = parseReverseAuth(cursor, groups); break;
      case 0x47: variant = parseReverseAuthResult(cursor, groups); break;
      case 0x48: variant = parseBalanceQuery(cursor, groups); break;
      case 0x49: variant = parseBalanceResult(cursor, groups); break;
      case 0x4a: variant = parseCredit(cursor, groups); break;
      case 0x4b: variant = parseCreditResult(cursor, groups); break;
      case 0x4c: variant = parseExtend(cursor, groups); break;
      case 0x4d: variant = parseExtendResult(cursor, groups); break;
      case 0x4e: variant = parseFileRequest(cursor, groups); break;
      case 0x4f: variant = parseFileBytes(cursor, groups); break;
      case 0x50: variant = parseFileContRequest(cursor, groups); break;
      case 0x51: variant = parseFileCont(cursor, groups); break;
      case 0x55: variant = parseCommandAck(cursor, groups); break;
      default: variant = parseUnknown(cursor, groups, code, info);
    }

    const expectedLengths = {
      0x11: [17],
      0x13: [104],
      0x14: [36],
      0x16: [7],
      0x17: [17],
      0x18: [44],
      0x19: [32],
      0x1b: [5],
      0x1e: [25],
      0x1f: [43],
      0x20: [11],
      0x21: [12],
      0x22: [1],
      0x24: [4],
      0x25: [6],
      0x26: [5],
      0x28: [1],
      0x2a: [106],
      0x2b: [23],
      0x2c: [196],
      0x2d: [36],
      0x2f: [196],
      0x40: [70],
      0x41: [61],
      0x42: [117],
      0x43: [170],
      0x44: [94],
      0x45: [170],
      0x46: [55],
      0x47: [99],
      0x48: [34],
      0x49: [72],
      0x4a: [57],
      0x4b: [85],
      0x4c: [41],
      0x4e: [51],
      0x4f: [55],
      0x50: [56],
      0x55: [4],
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
      protocol: "v19",
      protocolVersion: protocol.version,
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
    version: protocol.version,
    parsePayload,
    findField,
    bcdDigits,
    bcdDate,
    bcdDateTime,
    unsignedBigInt,
    scaledText,
  };
});
