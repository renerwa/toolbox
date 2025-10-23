import json
import re


def js_to_json(js_str):
    """
    将非标准JavaScript对象字符串转换为标准JSON字符串

    修复步骤：
    1. 为键添加双引号
    2. 将单引号字符串转为双引号（处理转义字符）
    3. 处理ISO日期格式
    4. 移除尾随逗号
    5. 移除注释
    """
    # 移除单行注释
    fixed = re.sub(r'//.*', '', js_str)
    # 移除多行注释
    fixed = re.sub(r'/\*.*?\*/', '', fixed, flags=re.DOTALL)
    # 修复键（添加双引号）
    fixed = re.sub(r'([{,]\s*)(\w+)(\s*:)', r'\1"\2"\3', fixed)
    # 修复单引号字符串，处理转义字符
    fixed = re.sub(r"'((?:\\'|[^'])*)'", lambda m: '"{}"'.format(m.group(1).replace('\\\'', '\'')), fixed)
    # 处理ISO日期格式（将裸露的日期时间字符串加上双引号）
    fixed = re.sub(r':\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)', r': "\1"', fixed)
    # 处理JavaScript特有的[Object]表示法，转换为空对象
    fixed = re.sub(r':\s*\[Object\]', r': {}', fixed)
    # 处理其他可能的JavaScript特殊值
    fixed = re.sub(r':\s*undefined', r': null', fixed)
    fixed = re.sub(r':\s*NaN', r': null', fixed)
    # 移除尾随逗号
    fixed = re.sub(r',\s*([}\]])', r'\1', fixed)

    try:
        # 尝试解析为Python对象
        data = json.loads(fixed)
        # 转换回格式化的JSON
        return json.dumps(data, indent=2, ensure_ascii=False)
    except json.JSONDecodeError as e:
        # 如果仍然失败，显示错误和修复后的内容
        print("修复后的字符串：")
        print(fixed)
        raise ValueError(f"转换失败：{str(e)}")


# 示例用法
if __name__ == "__main__":
    js_object_str = """
{

  func: 'syncOrder',

  model: 'order',

  orderData: {

    _id: 'ORD1704510021761183157396700',

    coupon_no: '14253910563',

    coupon_verified: true,

    coupon_verify_time: '2025-10-23T01:32:50.947Z',

    create_time: '2025-10-23T01:32:37.396Z',

    discount_detail: {

      couponDiscountAmt: 14,

      couponNo: '14253910563',

      gradeDiscountAmt: 0,

      specialDiscountAmt: 0

    },

    fp_id: '17045100203',

    fp_no: '3',

    member_id: '137308838',

    official_account_openid: 'og6dbwxqJpoZ9_DK_fK-8x9M6gvs',

    open_id: 'odjjG5aC7uugrrSrPxHDr1OnDgpo',

    order_amount: 20000,

    paid_at: '2025-10-23T01:33:57.666Z',

    pay_amount: 18600,

    pay_order_id: '4200002928202510233762158781',

    pay_status: 'paid',

    pr_id: 11,

    pr_name: '92#汽油',

    price: 7.12,

    station_id: '170451002',

    store_id: '4a5befaf68db865400d872ec4e392099',

    store_short_name: '安新加油站',

    sync_response: { code: 0, data: [Object], msg: '成功' },

    sync_status: 'syncing',

    sync_time: '2025-10-23T01:33:27.680Z',

    update_time: '2025-10-23T01:33:57.666Z'

  },

  orderId: 'ORD1704510021761183157396700',

  storeId: '4a5befaf68db865400d872ec4e392099',

  tcbContext: {},

  userInfo: { appId: 'wxc3ce4ebdccf5c1a5' }

}
    """

    try:
        json_result = js_to_json(js_object_str)
        print("转换成功：")
        print(json_result)
    except Exception as e:
        print(f"错误：{str(e)}")
