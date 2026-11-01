(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SinopecProtocol19 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const version = "V1.00.011";

  const commandCatalog = {
    0x10: { name: "轮询", description: "加油机上报枪号、上下班状态及授权模式。" },
    0x11: { name: "轮询应答", description: "FS 返回站点时间、各数据版本及程序更新标志。" },
    0x12: { name: "实时数据", description: "加油机上报插卡或加油中的枪状态数据。" },
    0x13: { name: "加油卡授权请求", description: "加油机上传加油卡信息并申请授权。" },
    0x14: { name: "员工作业卡授权请求", description: "加油机上传员工作业卡信息并申请授权。" },
    0x15: { name: "授权请求结果", description: "FS 返回授权金额、状态及附加信息。" },
    0x16: { name: "授权模式切换", description: "FS 指定前庭或后台授权模式。" },
    0x17: { name: "停止命令", description: "停止当前授权或加油任务。" },
    0x18: { name: "提交加油数据", description: "加油机挂枪后提交本次加油计量数据。" },
    0x19: { name: "支付数据", description: "FS 向加油机发送应扣、实付及优惠数据。" },
    0x1a: { name: "变价命令", description: "FS 实时下发各枪新旧油价。" },
    0x1b: { name: "回叫交易数据", description: "FS 按 POS-TTC 回叫交易记录。" },
    0x1c: { name: "备用命令", description: "协议预留命令字。" },
    0x1d: { name: "加油卡内交易明细", description: "加油机上传卡内历史交易明细记录。" },
    0x1e: { name: "灰记录查询", description: "加油机请求 FS 查询灰卡记录。" },
    0x1f: { name: "灰记录查询结果", description: "FS 返回灰卡匹配结果及解灰认证数据。" },
    0x20: { name: "黑白名单查询", description: "加油机按卡应用号查询黑白名单。" },
    0x21: { name: "黑白名单查询结果", description: "FS 返回黑白名单匹配结果。" },
    0x22: { name: "读取累计数", description: "FS 要求加油机上报各枪升累计。" },
    0x23: { name: "加油累计数", description: "加油机上报各枪升累计。" },
    0x24: { name: "请求下载数据", description: "加油机请求下载指定类型的数据文件。" },
    0x25: { name: "下载数据总长度", description: "FS 通知待下载数据文件的总长度。" },
    0x26: { name: "申请下载数据内容", description: "加油机指定下载内容、段偏移和段数。" },
    0x27: { name: "下载数据内容", description: "FS 发送指定数据段的内容。" },
    0x28: { name: "读取加油机信息", description: "FS 要求加油机上报设备及版本信息。" },
    0x29: { name: "加油机信息", description: "加油机上报厂家、站点、枪号及版本信息。" },
    0x2a: { name: "加油机内部错误", description: "加油机上报内部故障类别和错误内容。" },
    0x2b: { name: "后台授权", description: "FS 下发后台人工授权结果。" },
    0x2c: { name: "上传交易数据", description: "加油机上传完整的 195 字节交易记录。" },
    0x2d: { name: "其他（非卡）授权请求", description: "条码或键盘输入号码的非卡授权请求。" },
    0x2f: { name: "回送交易数据", description: "加油机按回叫命令回送完整交易记录。" },
    0x40: { name: "加油机签到", description: "加油机向后台联机业务中心签到。" },
    0x41: { name: "签到结果", description: "FS 返回签到成功或失败结果。" },
    0x42: { name: "在线申请授权", description: "加油机使用授权码或密码发起在线授权。" },
    0x43: { name: "在线申请授权应答", description: "FS 返回在线授权结果、金额和收款方式。" },
    0x44: { name: "上传加油结果", description: "加油机上传在线加油结果。" },
    0x45: { name: "上传加油结果应答", description: "FS 返回实付金额、错误信息和电子发票地址。" },
    0x46: { name: "撤销授权请求", description: "加油机请求撤销尚未执行的授权。" },
    0x47: { name: "撤销授权应答", description: "FS 返回授权撤销结果。" },
    0x48: { name: "查询用户可用余额", description: "加油机查询卡账户可用余额。" },
    0x49: { name: "查询用户可用余额应答", description: "FS 返回账户余额及密钥索引。" },
    0x4a: { name: "请求圈存", description: "加油机发起加油卡圈存交易。" },
    0x4b: { name: "请求圈存应答", description: "FS 返回圈存结果及交易验证码。" },
    0x4c: { name: "请求延长有效期", description: "加油机请求延长用户卡有效期。" },
    0x4d: { name: "请求延长有效期应答", description: "FS 返回延期结果及延期指令数据。" },
    0x4e: { name: "请求下载文件", description: "加油机按文件名请求下载文件。" },
    0x4f: { name: "下载文件总长度", description: "FS 返回待下载文件的总长度。" },
    0x50: { name: "申请下载文件内容", description: "加油机指定文件偏移和下载长度。" },
    0x51: { name: "下载文件内容", description: "FS 发送文件数据段。" },
    0x55: { name: "命令数据应答", description: "接收方确认命令处理结果。" },
  };

  const payMethods = {
    0x01: "前庭，加油卡电子油票",
    0x11: "室内，加油卡电子油票",
    0x02: "前庭，加油卡积分优惠",
    0x12: "室内，加油卡积分优惠",
    0x03: "前庭，联机用户备付金账户",
    0x13: "室内，联机用户备付金账户",
    0x04: "联机用户积分优惠账户",
    0x14: "室内，用户联机积分优惠账户",
    0x05: "前庭，不指定加油卡账户",
    0x15: "室内，不指定账户",
    0x06: "前庭，混合加油卡账户",
    0x16: "室内，混合加油卡账户",
    0x07: "员工作业卡前庭收银",
    0x17: "员工作业卡转室内收银",
    0x18: "其它，自助条码或现金",
  };

  const authResults = {
    0x01: "允许授权请求的付款方式",
    0x02: "允许授权，交易后需上传卡内历史记录（黄名单）",
    0x03: "用户黑名单卡，不允许使用",
    0x04: "作业卡号与白名单不匹配",
    0x05: "其它授权不成功",
  };

  const authModes = {
    0x00: "普通前庭授权模式（禁止后台授权）",
    0x01: "普通后台授权模式",
    0x02: "前庭授权增强模式（禁止后台授权）",
    0x03: "后台授权增强模式",
  };

  const commandResults = {
    0x01: "收到数据/命令，已处理",
    0x02: "收到数据/命令，正处理",
    0x03: "收到数据/命令，不能处理",
    0x04: "收到数据/命令，不处理",
    0x05: "收到交易数据，正确",
    0x06: "收到交易数据，T-MAC 错",
  };

  const contentTypes = {
    0x00: "基础黑名单",
    0x01: "新增黑名单",
    0x02: "新删黑名单",
    0x03: "白名单",
    0x04: "油品油价表",
    0x05: "油站通用信息",
    0x06: "私有数据",
    0x07: "下载程序",
  };

  const authorizeModes = {
    0: "前庭",
    1: "后台",
  };

  const workStates = {
    0: "下班",
    1: "上班",
  };

  const saleTypes = {
    0: "定量",
    1: "定额",
    2: "随意",
  };

  const dsSources = {
    0: "石油卡电子油票",
    1: "石油积分优惠区",
    2: "金融卡卡钱包",
    3: "金融卡电子存折",
    8: "现金",
    9: "其它",
  };

  const settlementMethods = {
    0: "现金",
    1: "油票",
    2: "记账",
    3: "银行卡",
    4: "其他",
    5: "其他 1",
  };

  const transactionTypes = {
    0x0: "正常加油",
    0x1: "逃卡",
    0x2: "错卡",
    0x3: "补扣",
    0x4: "补充",
    0x5: "员工上班",
    0x6: "员工下班",
    0x7: "非卡机联动",
    0x8: "油价信息回应",
    0x9: "卡交易出错记录",
    0xa: "在线异常逃卡",
    0xb: "在线异常",
    0xc: "非卡自助",
    0xd: "后台授权交易",
    0xe: "撤销授权",
    0xf: "备用",
  };

  const appNames = {
    0x00: "电子油票",
    0x01: "积分/优惠",
  };

  const cardStatusCodes = {
    "0000": "合法有效且无限制卡",
    "0001": "黑名单卡",
    "0002": "超过有效期的卡",
    "1001": "限油品卡 / 试图跨油品加油",
    "1002": "限地区卡 / 试图跨地区使用",
    "1003": "限次数卡 / 超出每日加油次数",
    "1004": "限金额卡 / 超出每日加油总金额",
    "1005": "限车号卡 / 车号不匹配",
    "1006": "限车号卡员工密码错误",
    "2001": "非白名单卡",
    "2002": "其它授权不成功",
    "2003": "其它未知错误",
  };

  const productCodes = {
    "1000": "汽油",
    "1010": "90# 汽油",
    "1011": "90# 无铅汽油",
    "1012": "90# 清洁汽油",
    "1020": "92# 清洁汽油",
    "1030": "93# 汽油",
    "1031": "93# 无铅汽油",
    "1032": "93# 清洁汽油",
    "1040": "95# 汽油",
    "1041": "95# 无铅汽油",
    "1042": "95# 清洁汽油",
    "1050": "97# 汽油",
    "1051": "97# 无铅汽油",
    "1052": "97# 清洁汽油",
    "1060": "120# 汽油",
    "1080": "其他车用汽油",
    "1090": "98# 汽油",
    "1091": "98# 无铅汽油",
    "1092": "98# 清洁汽油",
    "1100": "车用汽油",
    "1200": "航空汽油",
    "1201": "75# 航空汽油",
    "1202": "95# 航空汽油",
    "1203": "100# 航空汽油",
    "1204": "其他航空汽油",
    "1900": "其他汽油",
    "2000": "柴油",
    "2001": "0# 柴油",
    "2002": "+5# 柴油",
    "2003": "+10# 柴油",
    "2004": "+15# 柴油",
    "2005": "+20# 柴油",
    "2006": "-5# 柴油",
    "2007": "-10# 柴油",
    "2008": "-15# 柴油",
    "2009": "-20# 柴油",
    "2010": "-30# 柴油",
    "2011": "-35# 柴油",
    "2015": "-50# 柴油",
    "2100": "轻柴油",
    "2101": "其他轻柴油",
    "2200": "重柴油",
    "2212": "10# 重柴油",
    "2213": "20# 重柴油",
    "2214": "其他重柴油",
    "2300": "军用柴油",
    "2301": "-10# 军用柴油",
    "2900": "其他柴油",
  };

  function commandInfo(code) {
    if (commandCatalog[code]) return commandCatalog[code];
    if (code >= 0x30 && code <= 0x3f) {
      return { name: "协议保留命令", description: "19 版协议保留 30H–3FH，不定义具体报文。" };
    }
    if (code >= 0x52 && code <= 0x54) {
      return { name: "预留备用命令", description: "19 版协议预留 52H–54H。" };
    }
    return { name: "未定义命令", description: "19 版协议未定义该命令字。" };
  }

  return {
    version,
    commandCatalog,
    commandInfo,
    payMethods,
    authResults,
    authModes,
    commandResults,
    contentTypes,
    authorizeModes,
    workStates,
    saleTypes,
    dsSources,
    settlementMethods,
    transactionTypes,
    appNames,
    cardStatusCodes,
    productCodes,
  };
});
