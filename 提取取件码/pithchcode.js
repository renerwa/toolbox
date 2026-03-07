import OpenAI from 'openai';

// 定义提取车票信息的Prompt
const PROMPT_TICKET_EXTRACTION = `
请识别图片中的所有快递相关信息，并将结果以 JSON 格式输出。

# 识别目标：

** 每个快递包裹作为一个独立的对象（一个图片中可能有多个包裹）。 **

需要提取以下字段（如有缺失可留空）：

- package_index: 序号，从 1 开始

- tracking_number: 运单号（例如 SF1234567890、YT1234567890123）

- pickup_code: 取件码（一般是数字和中划线格式，不会是纯数字，例如 3-5-8272）

- pickup_point: 取件点名称或柜机地址（例如「丰巢快递柜A区」或「XX小区门口驿站」）

- courier_company: 快递公司（例如 顺丰、中通、圆通、申通、京东、邮政 等）

- raw_text: 对应这条快递信息在图中识别到的原始文字内容

# 注意事项：

- 图片中可能有多个快递的信息，请尽量分辨每一个快递的完整信息。

- 有的快递没有明确的取件码，而是提示使用运单号后几位在现场通过运单号查询取件码。 ** 在这种情况下，pickup_code字段请留空不要将运单号信息填入。 **

- 若图片中的快递没有明确的取件码或取件点，也请保留该对象，并让对应字段留空（例如 "pickup_code": ""）。

- 如果你无法确定某项信息，请不要猜测，保持为空字符串。

- 输出结果必须是一个 JSON 数组，每个元素表示一个快递。

- 不要输出任何额外说明、解释或多余文字，只返回 JSON。
`;

// 初始化OpenAI客户端
const client = new OpenAI({
    // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
   // 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    apiKey: 'sk-485fcfe2111948f2b72dd1f3af806f09',
  // 以下是北京地域base-url，如果使用新加坡地域的模型，需要将base_url替换为：https://dashscope-intl.aliyuncs.com/compatible-mode/v1
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

async function main() {
    try {
        // 创建聊天完成请求
        const completion = await client.chat.completions.create({
            model: "qwen-vl-ocr-latest",
            messages: [
                {
                    role: "user",
                    content: [
                        // qwen-vl-ocr、qwen-vl-ocr-latest、qwen-vl-ocr-2025-04-13及以后的快照模型支持在以下text字段中传入Prompt，若未传入，则会使用默认的Prompt：Please output only the text content from the image without any additional descriptions or formatting.
                        // 如调用qwen-vl-ocr-1028，模型会使用固定Prompt：Read all the text in the image.不支持用户在text中传入自定义Prompt
                        {
                            type: "image_url",
                            image_url: {
                                url: "https://636c-cloud1-4gijmfhk232ea46e-1379911011.tcb.qcloud.la/1.jpg?sign=39c01dc554416770940a06a9a4741f99&t=1762423972",
                            },
                            // 输入图像的最小像素阈值，小于该值图像会按原比例放大，直到总像素大于min_pixels
                            min_pixels: 28 * 28 * 4,
                            // 输入图像的最大像素阈值，超过该值图像会按原比例缩小，直到总像素低于max_pixels
                            max_pixels: 28 * 28 * 8192
                        },
                        {type: "text",
                         text: PROMPT_TICKET_EXTRACTION}
                    ]
                }
            ]
        });

        // 输出结果
        console.log(completion.choices[0].message.content);
    } catch (error) {
        console.log(`错误信息: ${error}`);
    }
}

main();