def xor_checksum(data: bytes) -> int:
    checksum = 0
    for byte in data:
        checksum ^= byte
    return checksum


def crc16(data: bytes,byteorder='little') -> bytes:

    crc = 0x0000
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x0001:
                crc >>= 1
                crc ^= 0xA001
            else:
                crc >>= 1

    return crc.to_bytes(2, byteorder=byteorder)


def hex_string_to_bytes(hex_str: str) -> bytes:
    """
    将十六进制字符串转换为字节流。
    例如：'52010006' -> b'\x52\x01\x00\x06'
    """
    hex_str = "".join(hex_str.split())  # 移除空白字符，支持格式更灵活
    return bytes.fromhex(hex_str)


# 云飞扬加密中石化协议（FA00E0）CRC 参数
YFY_CRC_POLY = 0xD3F5  # 反射多项式，正常写法为 0xAFCB
YFY_CRC_SEEDS = (0x98DE, 0x0587)


def crc16_yfy(data: bytes, seed: int = 0x98DE) -> int:
    """云飞扬协议 CRC-16：反射算法，poly=0xD3F5，xorout=0。"""
    crc = seed
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ (YFY_CRC_POLY if crc & 1 else 0)
    return crc & 0xFFFF


def unescape_yfy_fa(data: bytes) -> bytes:
    """还原云飞扬协议的字节填充：FA FA -> FA。"""
    result = bytearray()
    i = 0
    while i < len(data):
        if data[i] == 0xFA and i + 1 < len(data) and data[i + 1] == 0xFA:
            result.append(0xFA)
            i += 2
        else:
            result.append(data[i])
            i += 1
    return bytes(result)


def calculate_yfy_crc(hex_str: str):
    """
    计算云飞扬协议的两种 seed 结果。

    输入以 FA 开头且长度不少于 3 字节时，按完整帧处理：
    去掉帧头 FA，先做 FA FA -> FA 还原，再去掉帧尾 2 字节 CRC。
    否则把输入整体当作数据区计算。
    """
    raw = hex_string_to_bytes(hex_str)
    stored_crc = None

    if len(raw) >= 3 and raw[0] == 0xFA:
        unescaped = unescape_yfy_fa(raw[1:])  # 必须先还原填充，再取帧尾 CRC
        body = unescaped[:-2]
        stored_crc = unescaped[-2:]
    else:
        body = raw

    results = [(seed, crc16_yfy(body, seed)) for seed in YFY_CRC_SEEDS]
    return results, stored_crc


def calculate_checksum(hex_str):
    # 将输入的16进制字符串分割成字节列表
    hex_bytes = hex_str.split()

    # 初始化A和B
    A = 0
    B = 0

    # 遍历每个字节，计算A和B
    for byte in hex_bytes:
        # 转换为整数
        value = int(byte, 16)

        # 计算低4位和高4位的和
        A += value & 0x0F  # 低4位
        B += (value >> 4) & 0x0F  # 高4位

    # 计算校验字节
    checksum = A ^ B

    return checksum

if __name__ == "__main__":
    while(1):
        hex_input = input("请输入十六进制字符串: ")
        data = hex_string_to_bytes(hex_input)

        crc = crc16(data,'big')
        print("CRC16-big（中石化）:", crc.hex())

        crc = crc16(data,'little')
        print("CRC16-little:", crc.hex())

        yfy_results, yfy_stored = calculate_yfy_crc(hex_input)
        yfy_text = "  ".join(
            f"0x{seed:04X} -> {value:04X}" for seed, value in yfy_results
        )
        if yfy_stored is not None:
            matched = [
                f"0x{seed:04X}"
                for seed, value in yfy_results
                if value.to_bytes(2, 'big') == yfy_stored
            ]
            yfy_text += f"  （帧尾 {yfy_stored.hex().upper()}"
            yfy_text += f"，匹配 {'/'.join(matched)}）" if matched else "，未匹配）"
        print("云飞扬加密协议CRC16:", yfy_text)

        checksum = xor_checksum(data)
        print("CRC8:", hex(checksum))

        # 计算校验和
        checksum_zs = calculate_checksum(hex_input)
        print(f"中升油机校验和: 0x{checksum_zs:02X}")

        print('------------------------')
