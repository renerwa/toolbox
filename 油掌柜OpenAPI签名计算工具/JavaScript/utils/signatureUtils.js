const crypto = require('crypto');

/**
 * 签名工具类
 * 支持MD5和HMAC_MD5两种签名算法
 */
class SignatureUtils {
  /**
   * 计算签名
   * @param {Object} params - 请求参数对象
   * @param {string} secret - 应用密钥
   * @param {string} signMethod - 签名方法，支持 'md5' 或 'hmac'
   * @returns {string} 32位十六进制签名字符串
   */
  static calculateSignature(params, secret, signMethod = 'md5') {
    // 1. 过滤参数：排除sign参数和byte[]类型参数
    const filteredParams = {};
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'sign' && value !== null && value !== undefined && !Buffer.isBuffer(value)) {
        filteredParams[key] = value;
      }
    }

    // 2. 按参数名ASCII码顺序排序
    const sortedKeys = Object.keys(filteredParams).sort();
    
    // 3. 拼接参数字符串
    let paramString = '';
    for (const key of sortedKeys) {
      paramString += key + filteredParams[key];
    }

    // 4. 根据签名方法计算摘要
    let signature;
    if (signMethod.toLowerCase() === 'md5') {
      // MD5算法：md5(secret + paramString + secret)
      const signString = secret + paramString + secret;
      signature = crypto.createHash('md5').update(signString, 'utf8').digest('hex');
    } else if (signMethod.toLowerCase() === 'hmac') {
      // HMAC_MD5算法：hmac_md5(paramString) with secret as key
      signature = crypto.createHmac('md5', secret).update(paramString, 'utf8').digest('hex');
    } else {
      throw new Error('不支持的签名方法，仅支持 md5 或 hmac');
    }

    // 5. 返回32位十六进制字符串（MD5和HMAC_MD5都是128位，用16进制表示为32个字符）
    return signature.toUpperCase(); // 转为大写
  }

  /**
   * 验证签名
   * @param {Object} params - 包含签名的参数对象
   * @param {string} secret - 应用密钥
   * @param {string} signMethod - 签名方法
   * @returns {boolean} 签名是否有效
   */
  static verifySignature(params, secret, signMethod = 'md5') {
    if (!params.sign) {
      return false;
    }

    const receivedSign = params.sign;
    const calculatedSign = this.calculateSignature(params, secret, signMethod);
    
    return receivedSign.toUpperCase() === calculatedSign.toUpperCase();
  }

  /**
   * 为参数对象添加签名
   * @param {Object} params - 请求参数对象
   * @param {string} secret - 应用密钥
   * @param {string} signMethod - 签名方法
   * @returns {Object} 包含签名的参数对象
   */
  static addSignature(params, secret, signMethod = 'md5') {
    const signature = this.calculateSignature(params, secret, signMethod);
    return {
      ...params,
      sign: signature
    };
  }
}

module.exports = SignatureUtils;