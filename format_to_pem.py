import textwrap

def format_to_pem(key_content: str, key_type: str) -> str:
    """
    将纯文本密钥字符串格式化为标准的PEM格式。

    Args:
        key_content (str): 原始的Base64编码的密钥字符串（可以有或没有换行符）。
        key_type (str): 密钥类型，例如 "PRIVATE KEY", "PUBLIC KEY", "CERTIFICATE" 等。

    Returns:
        str: 格式化后的PEM字符串。
    """
    # 1. 移除输入字符串中所有已存在的空格和换行符，以确保我们从一个干净的、连续的字符串开始处理。
    cleaned_content = "".join(key_content.split())

    # 2. 构建标准的PEM头部和尾部，key_type 通常为大写。
    header = f"-----BEGIN {key_type.upper()}-----"
    footer = f"-----END {key_type.upper()}-----"

    # 3. 使用 textwrap 模块将长字符串每隔64个字符切片，并用换行符连接成一个字符串块。
    #    这是PEM格式的标准做法。
    wrapped_content = "\n".join(textwrap.wrap(cleaned_content, 64))

    # 4. 将头部、处理过的内容和尾部组合成最终的PEM格式字符串。
    pem_formatted_key = f"{header}\n{wrapped_content}\n{footer}"
    
    return pem_formatted_key

# --- 主程序入口 ---
if __name__ == "__main__":
    print("--- PEM 密钥格式转换脚本 ---")
    
    # 1. 获取用户输入的密钥内容
    # 使用一个循环来处理可能的多行粘贴
    print("\n[步骤 1/2] 请粘贴您的密钥内容 (粘贴后，在新的一行按 Ctrl+D (Linux/macOS) 或 Ctrl+Z 后回车 (Windows) 来结束输入):")
    input_lines = []
    try:
        while True:
            line = input()
            input_lines.append(line)
    except EOFError:
        pass
    
    raw_key_string = "".join(input_lines)

    if not raw_key_string.strip():
        print("\n错误：未检测到任何密钥内容。程序退出。")
    else:
        # 2. 获取用户输入的密钥类型
        print("\n[步骤 2/2] 请输入密钥类型 (例如: PRIVATE KEY, PUBLIC KEY, RSA PRIVATE KEY, CERTIFICATE):")
        key_type_input = input()

        if not key_type_input.strip():
            # 如果用户未输入类型，提供一个默认值并告知用户
            key_type_input = "PRIVATE KEY"
            print(f"\n警告：未输入密钥类型。将使用默认值 '{key_type_input}'。")

        # 3. 调用函数进行转换
        formatted_key = format_to_pem(raw_key_string, key_type_input)

        # 4. 打印格式化后的结果
        print("\n------ 转换完成！------")
        print("您可以复制下面的标准 PEM 格式密钥：\n")
        print(formatted_key)
        print("\n-------------------------")