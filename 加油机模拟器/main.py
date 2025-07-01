import socket
import threading
import time
import random
import binascii
import pymysql
import datetime
import logging
from logging.handlers import TimedRotatingFileHandler

# 创建logger
logger = logging.getLogger('my_logger')
logger.setLevel(logging.DEBUG)  # 设置日志级别

# 创建handler，设置为每小时滚动一次
handler = TimedRotatingFileHandler('logs/myapp.log', when='H', interval=1, backupCount=200)
handler.setLevel(logging.DEBUG)

# 创建formatter，并设置handler的formatter
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)

# 给logger添加handler
logger.addHandler(handler)

# 存储每个端口的连接和上次发送时间
connections = {}
lock = threading.Lock()  # 用于保护共享数据的锁
max_retries=30

# 数据库信息
host_name = "172.16.10.111"
user_name = "root"
user_password = "Costc0@MySQL2023"
db_name = "fuelpump"


def query_fuel_pump_status(host, user, password, db, port_number, mainboard_id):
    """
    查询指定PortNumber和MainboardID的加油油枪状态信息。

    参数:
    - host: 数据库服务器地址
    - user: 数据库用户名
    - password: 数据库密码
    - db: 数据库名
    - port_number: 端口号
    - mainboard_id: 主板编号

    返回:
    - 一个包含查询结果的字典列表，如果没有找到结果则返回空列表
    """
    # 连接到数据库
    connection = pymysql.connect(host=host_name,
                                 user=user_name,
                                 password=user_password,
                                 database=db_name,
                                 cursorclass=pymysql.cursors.DictCursor)

    try:
        with connection.cursor() as cursor:
            # 编写SQL查询语句
            sql = """  
            SELECT PumpStatus, Price, CurrentAccumulation, HasTransaction, OnlineStatus  ,SerialNumber
            FROM fuelpumpstatus  
            WHERE PortNumber = %s AND MainboardID = %s  
            """
            # 执行SQL查询
            cursor.execute(sql, (port_number, mainboard_id))
            # 获取所有查询结果
            results = cursor.fetchall()
            return results
    finally:
        # 关闭数据库连接
        connection.close()

def update_pump_status(host, user, password, database, port_number, mainboard_id):
    """
    更新数据库中指定PortNumber和MainboardID的记录的PumpStatus、HasTransaction和CurrentAccumulation。

    参数:
    - host: 数据库主机名
    - user: 数据库用户名
    - password: 数据库密码
    - database: 数据库名
    - port_number: 端口号（如果需要的话，否则在连接字符串中可能不需要）
    - mainboard_id: 要更新的记录的主板ID

    注意：此函数假设CurrentAccumulation是一个可以安全进行加法运算的数值类型字段。
    """
    # 注意：在实际应用中，port_number参数可能不会被直接使用，因为它通常包含在host参数中（如'localhost:3306'）
    # 但为了保持函数参数的灵活性，我还是将其包含在内

    # 数据库连接参数（不包括port_number，因为它通常不是直接需要的）
    db_config = {
        'host': "172.16.10.111",
        'user': "root",
        'password': "Costc0@MySQL2023",
        'database': "fuelpump",
        'charset': 'utf8mb4',
        'cursorclass': pymysql.cursors.DictCursor
    }

    # SQL查询和更新语句
    select_query = "SELECT CurrentAccumulation FROM fuelpumpstatus WHERE PortNumber = %s AND MainboardID = %s"
    update_query = "UPDATE fuelpumpstatus SET PumpStatus = 0, HasTransaction = 1, CurrentAccumulation = %s WHERE PortNumber = %s AND MainboardID = %s"

    try:
        # 连接数据库
        connection = pymysql.connect(**db_config)

        with connection.cursor() as cursor:
            # 查询当前的CurrentAccumulation值
            cursor.execute(select_query, (port_number, mainboard_id))
            result = cursor.fetchone()

            # 如果没有找到记录，则假设初始值为0.1（或根据业务需求调整）；否则使用查询到的值加0.01
            current_accumulation = 0.1 if result is None else result['CurrentAccumulation'] + 0.01

            # 更新记录
            cursor.execute(update_query, (current_accumulation, port_number, mainboard_id))

            # 提交事务
            connection.commit()

        print("加油状态数据更新成功！")

    except pymysql.MySQLError as e:
        print(f"数据库错误：{e}")
    finally:
        # 关闭数据库连接
        connection.close() if connection else None

def update_pump_status2(host, user, password, database, port_number, mainboard_id):
    """
    更新数据库中指定PortNumber和MainboardID的记录的PumpStatus、HasTransaction和CurrentAccumulation。

    参数:
    - host: 数据库主机名
    - user: 数据库用户名
    - password: 数据库密码
    - database: 数据库名
    - port_number: 端口号（如果需要的话，否则在连接字符串中可能不需要）
    - mainboard_id: 要更新的记录的主板ID

    注意：此函数假设CurrentAccumulation是一个可以安全进行加法运算的数值类型字段。
    """
    # 注意：在实际应用中，port_number参数可能不会被直接使用，因为它通常包含在host参数中（如'localhost:3306'）
    # 但为了保持函数参数的灵活性，我还是将其包含在内

    # 数据库连接参数（不包括port_number，因为它通常不是直接需要的）
    db_config = {
        'host': "172.16.10.111",
        'user': "root",
        'password': "Costc0@MySQL2023",
        'database': "fuelpump",
        'charset': 'utf8mb4',
        'cursorclass': pymysql.cursors.DictCursor
    }


    # SQL查询和更新语句
    select_query = "SELECT CurrentAccumulation FROM fuelpumpstatus WHERE PortNumber = %s AND MainboardID = %s"
    update_query = "UPDATE fuelpumpstatus SET PumpStatus = 1 WHERE PortNumber = %s AND MainboardID = %s"

    try:
        # 连接数据库
        connection = pymysql.connect(**db_config)

        with connection.cursor() as cursor:

            # 更新记录
            cursor.execute(update_query, ( port_number, mainboard_id))

            # 提交事务
            connection.commit()

        print("加油状态数据更新成功！")

    except pymysql.MySQLError as e:
        print(f"数据库错误：{e}")
    finally:
        # 关闭数据库连接
        connection.close() if connection else None

def update_HasTransaction(host, user, password, database, port_number, mainboard_id):
    """
    更新数据库中指定PortNumber和MainboardID的记录的PumpStatus、HasTransaction和CurrentAccumulation。

    参数:
    - host: 数据库主机名
    - user: 数据库用户名
    - password: 数据库密码
    - database: 数据库名
    - port_number: 端口号（如果需要的话，否则在连接字符串中可能不需要）
    - mainboard_id: 要更新的记录的主板ID

    注意：此函数假设CurrentAccumulation是一个可以安全进行加法运算的数值类型字段。
    """
    # 注意：在实际应用中，port_number参数可能不会被直接使用，因为它通常包含在host参数中（如'localhost:3306'）
    # 但为了保持函数参数的灵活性，我还是将其包含在内

    # 数据库连接参数（不包括port_number，因为它通常不是直接需要的）
    db_config = {
        'host': "172.16.10.111",
        'user': "root",
        'password': "Costc0@MySQL2023",
        'database': "fuelpump",
        'charset': 'utf8mb4',
        'cursorclass': pymysql.cursors.DictCursor
    }


    # SQL查询和更新语句
    update_query = "UPDATE fuelpumpstatus SET HasTransaction = 0 WHERE PortNumber = %s AND MainboardID = %s"

    try:
        # 连接数据库
        connection = pymysql.connect(**db_config)

        with connection.cursor() as cursor:

            # 更新记录
            cursor.execute(update_query, ( port_number, mainboard_id))

            # 提交事务
            connection.commit()

        print("交易状态数据更新成功！")

    except pymysql.MySQLError as e:
        print(f"数据库错误：{e}")
    finally:
        # 关闭数据库连接
        connection.close() if connection else None

def update_SerialNumber(host, user, password, database, port_number, mainboard_id,SerialNumber):
    """
    更新数据库中指定PortNumber和MainboardID的记录的PumpStatus、HasTransaction和CurrentAccumulation。

    参数:
    - host: 数据库主机名
    - user: 数据库用户名
    - password: 数据库密码
    - database: 数据库名
    - port_number: 端口号（如果需要的话，否则在连接字符串中可能不需要）
    - mainboard_id: 要更新的记录的主板ID

    注意：此函数假设CurrentAccumulation是一个可以安全进行加法运算的数值类型字段。
    """
    # 注意：在实际应用中，port_number参数可能不会被直接使用，因为它通常包含在host参数中（如'localhost:3306'）
    # 但为了保持函数参数的灵活性，我还是将其包含在内

    # 数据库连接参数（不包括port_number，因为它通常不是直接需要的）
    db_config = {
        'host': "172.16.10.111",
        'user': "root",
        'password': "Costc0@MySQL2023",
        'database': "fuelpump",
        'charset': 'utf8mb4',
        'cursorclass': pymysql.cursors.DictCursor
    }


    # SQL更新语句
    update_query = "UPDATE fuelpumpstatus SET SerialNumber = %s WHERE PortNumber = %s AND MainboardID = %s"

    try:
        # 连接数据库
        connection = pymysql.connect(**db_config)

        with connection.cursor() as cursor:

            # 更新记录
            cursor.execute(update_query, (SerialNumber, port_number, mainboard_id))

            # 提交事务
            connection.commit()

        print("链号更新成功！")

    except pymysql.MySQLError as e:
        print(f"数据库错误：{e}")
    finally:
        # 关闭数据库连接
        connection.close() if connection else None
def update_Price(host, user, password, database, port_number, mainboard_id,price):
    """
    更新数据库中指定PortNumber和MainboardID的记录的PumpStatus、HasTransaction和CurrentAccumulation。

    参数:
    - host: 数据库主机名
    - user: 数据库用户名
    - password: 数据库密码
    - database: 数据库名
    - port_number: 端口号（如果需要的话，否则在连接字符串中可能不需要）
    - mainboard_id: 要更新的记录的主板ID

    注意：此函数假设CurrentAccumulation是一个可以安全进行加法运算的数值类型字段。
    """
    # 注意：在实际应用中，port_number参数可能不会被直接使用，因为它通常包含在host参数中（如'localhost:3306'）
    # 但为了保持函数参数的灵活性，我还是将其包含在内

    # 数据库连接参数（不包括port_number，因为它通常不是直接需要的）
    db_config = {
        'host': "172.16.10.111",
        'user': "root",
        'password': "Costc0@MySQL2023",
        'database': "fuelpump",
        'charset': 'utf8mb4',
        'cursorclass': pymysql.cursors.DictCursor
    }


    # SQL更新语句
    update_query = "UPDATE fuelpumpstatus SET Price = %s WHERE PortNumber = %s AND MainboardID = %s"

    try:
        # 连接数据库
        connection = pymysql.connect(**db_config)

        with connection.cursor() as cursor:

            # 更新记录
            cursor.execute(update_query, (price, port_number, mainboard_id))

            # 提交事务
            connection.commit()

        print("单价更新成功！")

    except pymysql.MySQLError as e:
        print(f"数据库错误：{e}")
    finally:
        # 关闭数据库连接
        connection.close() if connection else None


def fuel_dispenser(command,port):
    # 首先检查命令开头的三个字节是否为ADEBC8
    command=binascii.hexlify(command).decode('utf-8').replace(' ', '')
    if command[:6].lower() != "adebc8":
        return bytes.fromhex("EE01")

    #通过命令里面的主板编号command[8:10]，和端口号查询对应油枪在线状态，如果离线就直接回复错误
    # print(command,command[9:10].lower(),type(command[9:10].lower()))
    # r = query_fuel_pump_status(host_name, user_name, user_password, db_name, port, command[9:10].lower())[0]
    # if r['OnlineStatus']=='0':
    #     return bytes.fromhex("EE00")

    #如果命令中有多个adebc8，提取第一个命令
    start_pos = command.find("adebc8")
    next_start_pos = command.find("adebc8", start_pos + 1)
    if next_start_pos != -1:
        command=command[start_pos:next_start_pos]

    # 提取第四个字节
    fourth_byte = command[6:8].lower()
    # 根据第四个字节的值进行不同的处理
    if fourth_byte == "94":
        # 提取第五个字节
        fifth_byte = command[8:10].lower()
        if fifth_byte == "01":
            r=query_fuel_pump_status(host_name,user_name,user_password,db_name,port,'1')[0]
            if r['PumpStatus'] == '0':
                # print('没有加油')
                if r['HasTransaction'] ==1:
                    bytes_obj = bytes.fromhex("ADEBC894010000002CB9")
                else:
                    # print('无交易可读')
                    bytes_obj=bytes.fromhex("adebc894010051180cd0")
            else:
                # print('加油中')
                bytes_obj = bytes.fromhex("adebc894010037428f6f")
            return bytes_obj
        elif fifth_byte == "02":
            r = query_fuel_pump_status(host_name, user_name, user_password, db_name, port, '2')[0]
            if r['PumpStatus'] == '0':
                # print('没有加油')
                if r['HasTransaction'] == 1:
                    # print('有交易可读')
                    bytes_obj = bytes.fromhex("ADEBC894020000002CBA")
                else:
                    # print('无交易可读')
                    bytes_obj = bytes.fromhex("adebc894020051180cd3")
            else:
                # print('加油中')
                bytes_obj = bytes.fromhex("adebc894020037428f6c")
            return bytes_obj
        else:
            return  bytes.fromhex("EE04")
    elif fourth_byte == "96":
        # 提取第五个字节
        fifth_byte = command[8:10].lower()
        if fifth_byte == "01":
            s="adebc89601000010000110123006"
            price=query_fuel_pump_status(host_name,user_name,user_password,db_name,port,'1')[0]['Price']
            s=s+str(int(price*100)).zfill(4)+"0000"
            num=query_fuel_pump_status(host_name,user_name,user_password,db_name,port,'1')[0]['SerialNumber']
            accumulation=query_fuel_pump_status(host_name,user_name,user_password,db_name,port,'1')[0]['CurrentAccumulation']
            accumulation_int=int(accumulation*100)
            accumulation_int_s= hex(accumulation_int)[2:].zfill(8)
            s=s+str(num).zfill(4)+accumulation_int_s+accumulation_int_s
            crc=xor_checksum(bytes.fromhex(s[6:56]),1)
            crc=binascii.hexlify(crc).decode('utf-8').replace(' ', '')
            s=s+crc
            bytes_obj=bytes.fromhex(s)
            return bytes_obj
        elif fifth_byte == "02":
            s="adebc89602000010000110123006"
            price=query_fuel_pump_status(host_name,user_name,user_password,db_name,port,'2')[0]['Price']
            s=s+str(int(price*100)).zfill(4)+"0000"
            num=query_fuel_pump_status(host_name,user_name,user_password,db_name,port,'2')[0]['SerialNumber']
            accumulation=query_fuel_pump_status(host_name,user_name,user_password,db_name,port,'2')[0]['CurrentAccumulation']
            accumulation_int=int(accumulation*100)
            accumulation_int_s= hex(accumulation_int)[2:].zfill(8)
            s=s+str(num).zfill(4)+accumulation_int_s+accumulation_int_s
            crc=xor_checksum(bytes.fromhex(s[6:56]),1)
            crc=binascii.hexlify(crc).decode('utf-8').replace(' ', '')
            s=s+crc
            bytes_obj=bytes.fromhex(s)
            return bytes_obj
        else:
            return bytes.fromhex("EE04")

    elif fourth_byte == "97":
        fifth_byte = command[8:10].lower()
        if fifth_byte == "01":
            update_HasTransaction(host_name,user_name,user_password,db_name,port,'1')
            bytes_obj = bytes.fromhex("adebc8970196")
            return bytes_obj
        elif fifth_byte == "02":
            update_HasTransaction(host_name,user_name,user_password,db_name,port,'2')
            bytes_obj = bytes.fromhex("adebc8970295")
            return bytes_obj
        else:
            return bytes.fromhex("EE04")
    elif fourth_byte == "57":
        fifth_byte = command[8:10].lower()
        if fifth_byte == "01":
            bytes_obj = bytes.fromhex("adebc8570156")
            return bytes_obj
        elif fifth_byte == "02":
            bytes_obj = bytes.fromhex("adebc8570255")
            return bytes_obj
        else:
            return bytes.fromhex("EE04")
    elif fourth_byte == "52":
        fifth_byte = command[8:10].lower()
        if fifth_byte == "01":
            num=int(command[45:48].lower())
            print('链号',num)
            update_SerialNumber(host_name, user_name, user_password, db_name, port, '1',num)
            update_pump_status2(host_name, user_name, user_password, db_name, port, '1')
            bytes_obj = bytes.fromhex("adebc85201bbe8")
            return bytes_obj
        elif fifth_byte == "02":
            num=int(command[45:48].lower())
            print('链号',num)
            update_SerialNumber(host_name, user_name, user_password, db_name, port, '2',num)
            update_pump_status2(host_name, user_name, user_password, db_name, port, '2')
            bytes_obj = bytes.fromhex("adebc85202bbeb")
            return bytes_obj

        else:
            return bytes.fromhex("EE04")
    elif fourth_byte == "53":
        fifth_byte = command[8:10].lower()
        if fifth_byte == "01":
            price_int=int(command[10:16].lower())
            price=float(price_int/10000)
            update_Price(host_name, user_name, user_password, db_name, port, '1',price)
            bytes_obj = bytes.fromhex("adebc8530152")
            return bytes_obj
        elif fifth_byte == "02":
            price_int=int(command[10:16].lower())
            price=float(price_int/10000)
            update_Price(host_name, user_name, user_password, db_name, port, '2',price)
            bytes_obj = bytes.fromhex("adebc8530251")
            return bytes_obj

        else:
            return bytes.fromhex("EE04")

    else:
        return  bytes.fromhex("EE05")

def xor_checksum(data: bytes,len) -> bytes:
    if len == 1 :
        checksum = 0
        for byte in data:
            checksum ^= byte
        return checksum.to_bytes(1, byteorder='little')
    elif len == 2:
        checksum=0x0000
        for byte in data:
            checksum ^= byte
            for _ in range(8):
                if checksum & 0x0001:
                    checksum >>= 1
                    checksum ^= 0xA001
                else:
                    checksum >>= 1
        return checksum.to_bytes(2, byteorder='little')
    else:
        return "错误的长度"
def handle_connection(port):
    global max_retries
    try:
        client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client_socket.bind(('', port))
        severs='172.16.10.111'
        # severs='127.0.0.1'

        client_socket.connect((severs, 18099))
        print(f"Connected to port {port}")

        # 将连接添加到connections字典中
        with lock:
            connections[port] = {'socket': client_socket, 'last_send': time.time()}

            # 接收数据的模拟（这里只是简单地等待和打印）
        while True:
            data = client_socket.recv(1024)
            if not data:
                print(f"No data received from port {port}. Exiting handle_connection.")
                break
            logger.debug(f"Received - {port}- {data.hex()}")

            # 生成一个介于50到100毫秒之间的随机时间（以秒为单位）
            random_wait_time = random.uniform(0.05, 0.1)

            # 延时等待（模拟油机返回需要的耗时）
            time.sleep(random_wait_time)
            response=fuel_dispenser(data,port)
            # response = "shoudao！".encode()
            client_socket.sendall(response)
            logger.debug(f"send - {port}- {response.hex()}")


    except socket.error as e:
        print(f"Error connecting to port {port}: {e}")
        if max_retries > 0:
            print(f'Retrying connection for client  {port} in 3 seconds...')
            time.sleep(3)
            max_retries -= 1
        else:
            print(f'Max retries reached for client {port}, exiting.')
    finally:
        # 从connections字典中移除连接（无论是否成功）
        with lock:
            if port in connections:
                connections[port]['socket'].close()
                del connections[port]


def send_abc_to_ports():
    global connections
    while True:
        with lock:
            current_time = time.time()

            for port, info in list(connections.items()):
                # print(datetime.datetime.fromtimestamp(time.time()),  '油枪挂抢程序','port',port)
                r = query_fuel_pump_status(host_name, user_name, user_password, db_name, port, '1')[0]
                if current_time - info['last_send'] >= random.uniform(8, 15) and r['PumpStatus']=='1':
                    update_pump_status(host_name,user_name,user_password,db_name,port,'1')
                    print('port:',port,'mainboard_id:',1,'加油完成')

                r = query_fuel_pump_status(host_name, user_name, user_password, db_name, port, '2')[0]
                if current_time - info['last_send'] >= random.uniform(8, 15) and r['PumpStatus']=='1':
                    update_pump_status(host_name,user_name,user_password,db_name,port,'2')
                    print('port:',port,'mainboard_id:',2,'加油完成')

        time.sleep(random.uniform(4, 8))

    # 主程序逻辑


def get_local_ip():
    """ 获取本机的IP地址（可能多个，取一个） """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # 不需要真的发送数据，只是让操作系统分配一个地址
        s.connect(("8.8.8.8", 80))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP


def get_hostname():
    """ 获取计算机名称 """
    return socket.gethostname()


def send_udp_broadcast(broadcast_ip, port, message):
    """ 发送UDP广播消息 """
    while True:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        try:
            sock.sendto(message.encode(), (broadcast_ip, port))
            # print(f"Broadcast sent to {broadcast_ip}:{port}")
        except Exception as e:
            print(f"Error sending broadcast: {e}")
        finally:
            sock.close()

            # 等待指定时间后再次发送
        time.sleep(5)

def main():
    ports = [1030, 1031,1032,1033,1034,1035,1036,1037,1038,1039,1040,1041,2030, 2031,2032,2033,2034,2035,2036,2037,2038,2039,2040,2041,3030, 3031,3032,3033,3034,3035,3036,3037,3038,3039,3040,3041]  # 示例端口列表
    # ports = [2030]  # 示例端口列表
    for port in ports:
        threading.Thread(target=handle_connection, args=(port,)).start()

        # 启动定时器线程
    threading.Thread(target=send_abc_to_ports, daemon=True).start()

    # 广播地址和端口
    BROADCAST_IP = "172.16.10.255"  # 替换为你的广播地址，例如 "192.168.1.255"
    PORT = 24680

    # 获取本地IP和主机名
    local_ip = get_local_ip()
    hostname = get_hostname()

    # 构造消息
    message = f"IP: {local_ip}, Hostname: {hostname},Fuel dispenser simulator"
    threading.Thread(target=send_udp_broadcast,args=(BROADCAST_IP,PORT,message), daemon=True).start()


    # 注意：在实际应用中，你可能需要某种机制来保持主线程运行，例如等待用户输入或某个事件。
    # 在这个示例中，我们让主线程立即退出，但守护线程（daemon=True）将继续运行。


if __name__ == "__main__":
    main()

# 注意：
# 1. 这个示例中的`handle_connection`函数在接收到EOF（即对方关闭了连接）时会退出。
# 2. `send_abc_to_ports`函数是一个无限循环，它定期检查所有连接并发送「ABC」。
# 3. 我们使用了线程锁（`lock`）来保护对`connections`字典的访问，以防止竞态条件。
# 4. 主线程在启动所有线程后立即退出，但守护线程（`send_abc_to_ports`）将继续运行，直到所有非守护线程退出或程序被强制终止。在这个例子中，由于`handle_connection`线程在连接关闭时会自行退出，因此当所有连接都关闭时，Python解释器将退出（如果没有其他非守护线程在运行的话）。然而，如果`handle_connection`线程永远不会退出（例如，如果它们在一个无限循环中等待数据），则程序将不会自行退出，除非你明确地终止它（例如，通过Ctrl+C）。