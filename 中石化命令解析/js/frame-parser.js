(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SinopecFrameParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function byteHex(value) {
    return Number(value).toString(16).padStart(2, "0").toUpperCase();
  }

  function bytesHex(bytes) {
    return Array.from(bytes || [], byteHex).join(" ");
  }

  function crc16(bytes) {
    let crc = 0x0000;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
      }
    }
    return crc & 0xffff;
  }

  function decodeBcdLength(high, low) {
    const nibbles = [high >>> 4, high & 0x0f, low >>> 4, low & 0x0f];
    if (nibbles.some((value) => value > 9)) {
      return { valid: false, value: null, text: `${byteHex(high)} ${byteHex(low)}` };
    }
    return {
      valid: true,
      value: nibbles.reduce((total, value) => total * 10 + value, 0),
      text: nibbles.join(""),
    };
  }

  function detectStage(prefix) {
    const stages = [
      ["handleData", /handleData/i],
      ["加上 CRC", /加上\s*CRC/i],
      ["去除转义", /去除转义/],
      ["接收完整", /数据接收完整/],
      ["current data", /current\s+data/i],
      ["receive data", /receive\s+data/i],
    ];
    const match = stages.find((entry) => entry[1].test(prefix));
    return match ? match[0] : "日志报文";
  }

  function tokenizeSequential(text, startIndex) {
    const bytes = [];
    let cursor = startIndex;
    while (cursor < text.length) {
      while (cursor < text.length && /[\s,]/.test(text[cursor])) cursor += 1;
      if (/^0x/i.test(text.slice(cursor, cursor + 2))) cursor += 2;
      const token = text.slice(cursor, cursor + 2);
      const boundary = text[cursor + 2];
      if (!/^[0-9a-f]{2}$/i.test(token)) break;
      if (boundary && !/[\s,]/.test(boundary) && !/^0x/i.test(text.slice(cursor + 2))) break;
      bytes.push(Number.parseInt(token, 16));
      cursor += 2;
    }
    return bytes;
  }

  function isPureHexInput(text) {
    const normalized = text.replace(/0x/gi, "").replace(/[\s,]/g, "");
    return normalized.length >= 2 && normalized.length % 2 === 0 && /^[0-9a-f]+$/i.test(normalized);
  }

  function pureHexTokens(text) {
    const normalized = text.replace(/0x/gi, "").replace(/[\s,]/g, "");
    return normalized.match(/.{2}/g).map((token) => Number.parseInt(token, 16));
  }

  function decodePayload(tokens, payloadStart, declaredLength, escaped) {
    const decoded = [];
    let cursor = payloadStart;
    let escapePairs = 0;
    while (cursor < tokens.length && decoded.length < declaredLength) {
      const value = tokens[cursor];
      if (escaped && value === 0xfa && tokens[cursor + 1] === 0xfa) {
        decoded.push(0xfa);
        escapePairs += 1;
        cursor += 2;
      } else {
        decoded.push(value);
        cursor += 1;
      }
    }
    return {
      decoded,
      rawEnd: cursor,
      complete: decoded.length === declaredLength,
      escapePairs,
    };
  }

  function crcDetails(tokens, rawEnd, canonical) {
    const calculated = crc16(canonical.slice(1));
    const high = calculated >>> 8;
    const low = calculated & 0xff;
    const remaining = tokens.length - rawEnd;
    let present = false;

    if (remaining >= 2 && tokens[rawEnd] === high && tokens[rawEnd + 1] === low) {
      present = true;
    } else if (remaining === 2) {
      present = true;
    } else if (remaining >= 3 && tokens[rawEnd + 2] === 0xfa && tokens[rawEnd] !== 0xfa) {
      present = true;
    }

    if (!present) {
      return {
        state: "missing",
        received: null,
        calculated,
        consumed: 0,
      };
    }

    const received = (tokens[rawEnd] << 8) | tokens[rawEnd + 1];
    return {
      state: received === calculated ? "valid" : "invalid",
      received,
      calculated,
      consumed: 2,
    };
  }

  function buildCandidate(tokens, start, declaredLength, escaped, context) {
    const header = tokens.slice(start, start + 6);
    const payloadResult = decodePayload(tokens, start + 6, declaredLength, escaped);
    const canonical = header.concat(payloadResult.decoded);
    const crc = payloadResult.complete
      ? crcDetails(tokens, payloadResult.rawEnd, canonical)
      : { state: "missing", received: null, calculated: null, consumed: 0 };
    const diagnostics = [];

    if (!payloadResult.complete) {
      diagnostics.push({
        level: "error",
        message: `报文不完整：声明 ${declaredLength} 字节有效数据，实际只有 ${payloadResult.decoded.length} 字节。`,
      });
    }
    if (crc.state === "invalid") {
      diagnostics.push({
        level: "error",
        message: `CRC 错误：报文为 ${crc.received.toString(16).padStart(4, "0").toUpperCase()}，计算值为 ${crc.calculated.toString(16).padStart(4, "0").toUpperCase()}。`,
      });
    }

    const stagePrefersEscaped = /receive data|current data/.test(context.stage);
    const stagePrefersDecoded = /去除转义|加上 CRC|handleData/.test(context.stage);
    let score = payloadResult.complete ? 20 : 0;
    if (crc.state === "valid") score += 20;
    if (crc.state === "invalid") score += 4;
    if ((stagePrefersEscaped && escaped) || (stagePrefersDecoded && !escaped)) score += 3;
    if (!escaped) score += 1;

    return {
      score,
      escapedInput: escaped && payloadResult.escapePairs > 0,
      canonical,
      payload: payloadResult.decoded,
      actualLength: payloadResult.decoded.length,
      complete: payloadResult.complete,
      crc,
      diagnostics,
      rawConsumed: payloadResult.rawEnd - start + crc.consumed,
    };
  }

  function parseAt(tokens, start, context) {
    const available = tokens.length - start;
    if (available < 6) {
      const canonical = tokens.slice(start);
      return {
        canonical,
        payload: [],
        actualLength: 0,
        declaredLength: null,
        lengthText: null,
        complete: false,
        escapedInput: false,
        crc: { state: "missing", received: null, calculated: null },
        diagnostics: [{ level: "error", message: `帧头不完整：至少需要 6 字节，实际只有 ${available} 字节。` }],
        rawConsumed: Math.max(available, 1),
        ...context,
      };
    }

    const lengthInfo = decodeBcdLength(tokens[start + 4], tokens[start + 5]);
    if (!lengthInfo.valid) {
      const nextFrame = tokens.indexOf(0xfa, start + 1);
      const end = nextFrame === -1 ? tokens.length : nextFrame;
      const canonical = tokens.slice(start, end);
      return {
        canonical,
        payload: canonical.slice(6),
        actualLength: Math.max(canonical.length - 6, 0),
        declaredLength: null,
        lengthText: lengthInfo.text,
        complete: false,
        escapedInput: false,
        crc: { state: "missing", received: null, calculated: null },
        diagnostics: [{ level: "error", message: `有效数据长度不是合法压缩 BCD：${lengthInfo.text}。` }],
        rawConsumed: Math.max(end - start, 1),
        ...context,
      };
    }

    const candidates = [
      buildCandidate(tokens, start, lengthInfo.value, false, context),
      buildCandidate(tokens, start, lengthInfo.value, true, context),
    ].sort((left, right) => right.score - left.score);
    const selected = candidates[0];
    const control = tokens[start + 3];

    return {
      ...selected,
      declaredLength: lengthInfo.value,
      lengthText: lengthInfo.text,
      destination: tokens[start + 1],
      source: tokens[start + 2],
      control,
      caller: control & 0x40 ? "PC 主动模式" : "加油机主动模式",
      frameNumber: control & 0x3f,
      ...context,
    };
  }

  function framesFromTokens(tokens, context) {
    const frames = [];
    const diagnostics = [];
    let cursor = 0;
    while (cursor < tokens.length) {
      const start = tokens.indexOf(0xfa, cursor);
      if (start === -1) break;
      const frame = parseAt(tokens, start, context);
      const frameEnd = start + Math.max(frame.rawConsumed, 1);
      const nextFrame = tokens.indexOf(0xfa, frameEnd);
      const trailingEnd = nextFrame === -1 ? tokens.length : nextFrame;
      const trailingBytes = tokens.slice(frameEnd, trailingEnd);
      frame.trailingBytes = trailingBytes;
      if (trailingBytes.length) {
        const diagnostic = {
          level: "warning",
          message: `声明长度之后还有 ${trailingBytes.length} 个额外字节：${bytesHex(trailingBytes)}。`,
        };
        frame.diagnostics.push(diagnostic);
      }
      frames.push(frame);
      diagnostics.push(...frame.diagnostics.map((diagnostic) => ({ ...diagnostic, lineNumber: context.lineNumber })));
      cursor = frameEnd;
    }
    return { frames, diagnostics };
  }

  function extractFrames(text, options) {
    const source = String(text || "");
    const batchId = options && options.batchId ? options.batchId : 1;
    if (!source.trim()) {
      return { frames: [], diagnostics: [{ level: "warning", message: "输入内容为空。" }] };
    }

    if (isPureHexInput(source)) {
      const tokens = pureHexTokens(source);
      const result = framesFromTokens(tokens, {
        lineNumber: 1,
        batchId,
        stage: "纯十六进制",
        sourceLine: source.trim(),
      });
      if (!result.frames.length) {
        result.diagnostics.push({ level: "error", message: "没有找到 FA 帧头。" });
      }
      return result;
    }

    const frames = [];
    const diagnostics = [];
    source.split(/\r?\n/).forEach((line, index) => {
      const match = /(?:^|[^0-9a-f])FA(?=$|[^0-9a-f])/i.exec(line);
      if (!match) return;
      const faIndex = match.index + match[0].toUpperCase().lastIndexOf("FA");
      const tokens = tokenizeSequential(line, faIndex);
      const lineResult = framesFromTokens(tokens, {
        lineNumber: index + 1,
        batchId,
        stage: detectStage(line.slice(0, faIndex)),
        sourceLine: line.trim(),
      });
      frames.push(...lineResult.frames);
      diagnostics.push(...lineResult.diagnostics);
    });

    if (!frames.length) {
      diagnostics.push({
        level: "error",
        message: "没有识别到报文。请粘贴包含 FA 帧头的日志或空格分隔的十六进制报文。",
      });
    }
    return { frames, diagnostics };
  }

  function aggregateFrames(frames) {
    const groups = new Map();
    for (const frame of frames || []) {
      const key = bytesHex(frame.canonical);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          frame,
          occurrences: [],
          count: 0,
          crcStates: new Set(),
        });
      }
      const group = groups.get(key);
      group.count += 1;
      group.crcStates.add(frame.crc.state);
      group.occurrences.push({
        batchId: frame.batchId,
        lineNumber: frame.lineNumber,
        stage: frame.stage,
        crcState: frame.crc.state,
      });
      if (frame.crc.state === "valid" || (frame.crc.state === "invalid" && group.frame.crc.state === "missing")) {
        group.frame = frame;
      }
    }

    return Array.from(groups.values()).map((group) => ({
      ...group,
      crcStates: Array.from(group.crcStates),
    }));
  }

  return {
    byteHex,
    bytesHex,
    crc16,
    decodeBcdLength,
    extractFrames,
    aggregateFrames,
  };
});
