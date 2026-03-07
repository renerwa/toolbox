from scapy.all import sniff, TCP

# 定义处理数据包的函数
def packet_callback(packet):
    # 检查是否是TCP包并且目的端口是1047
    if TCP in packet and packet[TCP].dport == 1047:
        print(f"Source IP: {packet[IP].src}")
        print(f"Destination IP: {packet[IP].dst}")
        print(f"Source Port: {packet[TCP].sport}")
        print(f"Destination Port: {packet[TCP].dport}")
        print(f"Payload: {bytes(packet[TCP].payload)}")
        print("-" * 50)

# 使用Scapy的sniff函数来监听发往1047端口的数据包
sniff(filter="tcp port 1047", prn=packet_callback)
