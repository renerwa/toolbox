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

  _id: 'ORD1654810051761114037934629',

  official_account_openid: 'o1dr10QhDT7aAvkdewpe6hVs9dJU',

  open_id: 'odjjG5a8fn2gFQOcL9MMcvJgzXK8',

  member_id: '137470129',

  store_id: '6149379668414e2b01f54e077bdb0894',

  store_short_name: '陈龙测试站',

  station_id: '165481005',

  fp_no: '1',

  fp_id: '16548100501',

  pr_id: 11,

  pr_name: '92#汽油',

  price: 6.5,

  order_amount: 1,

  pay_amount: 0,

  coupon_no: '',

  pay_status: 'pending',

  sync_status: 'pending',

  create_time: 2025-10-22T06:20:37.935Z,

  update_time: 2025-10-22T06:20:37.935Z,

  discount_detail: {

    couponDiscountAmt: 0,

    couponNo: '',

    gradeDiscountAmt: 0.01,

    specialDiscountAmt: 0

  }

}
    """

    try:
        json_result = js_to_json(js_object_str)
        print("转换成功：")
        print(json_result)
    except Exception as e:
        print(f"错误：{str(e)}")
