def parse_ifsf_command(hex_command):
    # 将十六进制字符串转换为字节对象
    command_bytes = bytes.fromhex(hex_command)
    
    # 解析各个部分
    lnar = command_bytes[:2]
    lnao = command_bytes[2:4]
    mc = command_bytes[4:5]
    m_st = command_bytes[5:6]
    m_lg_bytes = command_bytes[6:8]
    m_lg = int.from_bytes(m_lg_bytes, byteorder='big')
    db_ad_lg = command_bytes[8:9]
    db_ad_lg_value = int.from_bytes(db_ad_lg, byteorder='big')
    db_ad = command_bytes[9:9 + db_ad_lg_value]
    data = command_bytes[9 + db_ad_lg_value:]
    
    # 解析 M_ST 的地址 8、7、6 位
    m_st_value = int.from_bytes(m_st, byteorder='big')
    bits = (m_st_value >> 5) & 0x7
    m_st_descriptions = {
        0: "读消息",
        1: "应答消息",
        2: "写消息",
        3: "带确认的主动消息",
        4: "不带确认的主动消息",
        7: "确认消息"
    }
    m_st_description = m_st_descriptions.get(bits, "未知类型消息")

    result = {
        'LNAR': lnar.hex(),
        'LNAO': lnao.hex(),
        'MC': mc.hex(),
        'M_ST': m_st.hex(),
        'M_Lg': m_lg,
        'DB_Ad_Lg': db_ad_lg_value,
        'DB_Ad': db_ad.hex(),
        'Data': data.hex(),
        'M_ST说明': m_st_description
    }
    mc_value = int.from_bytes(mc, byteorder='big')
    if mc_value == 0:
        result['MC说明'] = '应用层消息'
    elif mc_value == 1:
        result['MC说明'] = '心跳消息'
    else:
        mc_descriptions = {
            0: "同步时间",
            1: "心跳包",
            2: "事件上报"
        }
        mc_description = mc_descriptions.get(mc_value, "未知消息类型")
        result['MC说明'] = mc_description
        result['MC说明'] = '未知消息类型'
    return result

if __name__ == '__main__':
    while True:
        try:
            hex_command = input('请输入IFSF协议的16进制命令（输入q退出）: ')
            if hex_command.lower() == 'q':
                break
            result = parse_ifsf_command(hex_command)
            print('-' * 30)
            print('解析结果:')
            for key, value in result.items():
                print(f'{key}: {value}')
            print('-' * 30)
        except ValueError as e:
            print(f'输入错误: {e}，请输入有效的16进制字符串。')