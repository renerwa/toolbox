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
    hex_str = hex_str.replace(" ", "")  # 移除空格，支持格式更灵活
    return bytes.fromhex(hex_str)


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
        print("CRC16-big:", crc.hex())

        crc = crc16(data,'little')
        print("CRC16-little:", crc.hex())

        checksum = xor_checksum(data)
        print("CRC8:", hex(checksum))

        # 计算校验和
        checksum_zs = calculate_checksum(hex_input)
        print(f"中升油机校验和: 0x{checksum_zs:02X}")

        print('------------------------')