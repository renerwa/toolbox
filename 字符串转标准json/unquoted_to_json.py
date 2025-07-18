import json
import re


def js_to_json(js_str):
    """
    将非标准JavaScript对象字符串转换为标准JSON字符串

    修复步骤：
    1. 为键添加双引号
    2. 将单引号字符串转为双引号
    3. 移除尾随逗号
    4. 移除注释
    """
    # 修复键（添加双引号）
    fixed = re.sub(r'([{,]\s*)(\w+)(\s*:)', r'\1"\2"\3', js_str)
    # 修复单引号字符串
    fixed = re.sub(r"'([^']+)'", r'"\1"', fixed)
    # 移除尾随逗号
    fixed = re.sub(r',\s*([}\]])', r'\1', fixed)
    # 移除单行注释
    fixed = re.sub(r'//.*', '', fixed)
    # 移除多行注释
    fixed = re.sub(r'/\*.*?\*/', '', fixed, flags=re.DOTALL)

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

    couponNo: '',

    discountDetail: {

      couponDiscountAmt: 0,

      couponNo: '',

      gradeDiscountAmt: 0.01,

      specialDiscountAmt: 0

    },

    fpId: '16548100501',

    fpNo: '1',

    memberId: '137470129',

    officialAccountOpenid: 'o1dr10QhDT7aAvkdewpe6hVs9dJU',

    openId: 'odjjG5a8fn2gFQOcL9MMcvJgzXK8',

    orderAmount: 1,

    payAmount: 0,

    prId: 11,

    prName: '92#汽油',

    price: 7.07,

    stationId: '165481005',

    storeId: '6149379668414e2b01f54e077bdb0894',

    storeShortName: '陈龙测试站'

  }
    """

    try:
        json_result = js_to_json(js_object_str)
        print("转换成功：")
        print(json_result)
    except Exception as e:
        print(f"错误：{str(e)}")