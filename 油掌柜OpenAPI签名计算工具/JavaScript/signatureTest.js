const SignatureUtils = require('./utils/signatureUtils');
const readline = require('readline');

/**
 * 签名计算测试脚本
 * 允许用户输入参数并计算签名
 */
class SignatureTest {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * 提示用户输入
   * @param {string} question - 提示问题
   * @returns {Promise<string>} 用户输入
   */
  question(question) {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  /**
   * 解析参数字符串为对象
   * @param {string} paramStr - 参数字符串，格式：key1=value1,key2=value2
   * @returns {Object} 参数对象
   */
  parseParams(paramStr) {
    const params = {};
    if (!paramStr.trim()) {
      return params;
    }

    const pairs = paramStr.split(',');
    for (const pair of pairs) {
      const [key, value] = pair.split('=').map(s => s.trim());
      if (key && value !== undefined) {
        params[key] = value;
      }
    }
    return params;
  }

  /**
   * 显示参数对象
   * @param {Object} params - 参数对象
   */
  displayParams(params) {
    console.log('\n解析后的参数:');
    console.log(JSON.stringify(params, null, 2));
  }

  /**
   * 主要运行逻辑
   */
  async run() {
    console.log('=== 签名计算工具 ===');
    console.log('输入格式说明：');
    console.log('参数格式：key1=value1,key2=value2,key3=value3');
    console.log('签名方法：md5 或 hmac');
    console.log('输入 "exit" 退出程序\n');

    while (true) {
      try {
        // 获取用户输入
        const paramInput = await this.question('请输入请求参数 (格式: key1=value1,key2=value2): ');
        
        if (paramInput.toLowerCase() === 'exit') {
          console.log('程序退出');
          break;
        }

        const secret = await this.question('请输入应用密钥 (secret): ');
        const signMethod = await this.question('请输入签名方法 (md5/hmac，默认md5): ') || 'md5';

        // 解析参数
        const params = this.parseParams(paramInput);
        this.displayParams(params);

        // 计算签名
        console.log('\n计算签名中...');
        const signature = SignatureUtils.calculateSignature(params, secret, signMethod);
        
        // 添加签名到参数中
        const signedParams = SignatureUtils.addSignature(params, secret, signMethod);

        // 显示结果
        console.log('\n=== 签名结果 ===');
        console.log(`签名方法: ${signMethod.toUpperCase()}`);
        console.log(`计算的签名: ${signature}`);
        console.log('\n完整的签名参数:');
        console.log(JSON.stringify(signedParams, null, 2));

        // 验证签名
        const isValid = SignatureUtils.verifySignature(signedParams, secret, signMethod);
        console.log(`\n签名验证: ${isValid ? '✓ 有效' : '✗ 无效'}`);
        
        console.log('\n' + '='.repeat(50) + '\n');

      } catch (error) {
        console.error('错误:', error.message);
        console.log('请重新输入\n');
      }
    }

    this.rl.close();
  }

  /**
   * 示例演示
   */
  static showExample() {
    console.log('\n=== 使用示例 ===');
    
    const exampleParams = {
      app_id: '12345',
      method: 'test.api',
      timestamp: '1640995200',
      version: '1.0'
    };
    const exampleSecret = 'your_secret_key';
    const exampleSignMethod = 'md5';

    console.log('示例参数:', JSON.stringify(exampleParams, null, 2));
    console.log('示例密钥:', exampleSecret);
    console.log('签名方法:', exampleSignMethod);

    const signature = SignatureUtils.calculateSignature(exampleParams, exampleSecret, exampleSignMethod);
    const signedParams = SignatureUtils.addSignature(exampleParams, exampleSecret, exampleSignMethod);

    console.log('\n计算结果:');
    console.log('签名:', signature);
    console.log('完整参数:', JSON.stringify(signedParams, null, 2));
    console.log('='.repeat(30));
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const test = new SignatureTest();
  
  // 显示示例
  SignatureTest.showExample();
  
  // 运行交互式测试
  test.run().catch(console.error);
}

module.exports = SignatureTest;