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
    # 处理裸露的变量作为值 (e.g. {key: some_var})
    fixed = re.sub(r':\s*((?!(?:true|false|null)\b)[a-zA-Z_][a-zA-Z0-9_]*)', r': "\1"', fixed)
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
  type: 3,
  id: '1413172797940695184',
  applicationId: '1412079610815844543',
  channelId: '1413172369471574128',
  guildId: '1406109276447178864',
  user: User {
    id: '1089349588374261950',
    bot: false,
    system: false,
    flags: UserFlagsBitField { bitfield: 0 },
    username: 'erwa007',
    globalName: 'MADGUN',
    discriminator: '0',
    avatar: null,
    banner: undefined,
    accentColor: undefined,
    avatarDecoration: null,
    avatarDecorationData: null,
    collectibles: null,
    primaryGuild: null
  },
  member: GuildMember {
    guild: Guild {
      id: '1406109276447178864',
      name: 'TestServer',
      icon: null,
      features: [],
      commands: [GuildApplicationCommandManager],
      members: [GuildMemberManager],
      channels: [GuildChannelManager],
      bans: [GuildBanManager],
      roles: [RoleManager],
      presences: PresenceManager {},
      voiceStates: [VoiceStateManager],
      stageInstances: [StageInstanceManager],
      invites: [GuildInviteManager],
      scheduledEvents: [GuildScheduledEventManager],
      autoModerationRules: [AutoModerationRuleManager],
      soundboardSounds: [GuildSoundboardSoundManager],
      available: true,
      shardId: 0,
      splash: null,
      banner: null,
      description: null,
      verificationLevel: 0,
      vanityURLCode: null,
      nsfwLevel: 0,
      premiumSubscriptionCount: 0,
      discoverySplash: null,
      memberCount: 5,
      large: false,
      premiumProgressBarEnabled: false,
      applicationId: null,
      afkTimeout: 300,
      afkChannelId: null,
      systemChannelId: '1406109276447178866',
      premiumTier: 0,
      widgetEnabled: null,
      widgetChannelId: null,
      explicitContentFilter: 0,
      mfaLevel: 0,
      joinedTimestamp: 1756782062940,
      defaultMessageNotifications: 0,
      systemChannelFlags: [SystemChannelFlagsBitField],
      maximumMembers: 25000000,
      maximumPresences: null,
      maxVideoChannelUsers: 25,
      maxStageVideoChannelUsers: 50,
      approximateMemberCount: null,
      approximatePresenceCount: null,
      vanityURLUses: null,
      rulesChannelId: null,
      publicUpdatesChannelId: null,
      preferredLocale: 'en-US',
      safetyAlertsChannelId: null,
      ownerId: '1089349588374261950',
      emojis: [GuildEmojiManager],
      stickers: [GuildStickerManager],
      incidentsData: null
    },
    joinedTimestamp: 1755312975780,
    premiumSinceTimestamp: null,
    nickname: null,
    pending: false,
    communicationDisabledUntilTimestamp: null,
    user: User {
      id: '1089349588374261950',
      bot: false,
      system: false,
      flags: [UserFlagsBitField],
      username: 'erwa007',
      globalName: 'MADGUN',
      discriminator: '0',
      avatar: null,
      banner: undefined,
      accentColor: undefined,
      avatarDecoration: null,
      avatarDecorationData: null,
      collectibles: null,
      primaryGuild: null
    },
    avatar: null,
    banner: null,
    flags: GuildMemberFlagsBitField { bitfield: 0 },
    avatarDecorationData: null
  },
  version: 1,
  appPermissions: PermissionsBitField { bitfield: 4503599627370495n },
  memberPermissions: PermissionsBitField { bitfield: 4503599627370495n },
  locale: 'zh-CN',
  guildLocale: 'en-US',
  entitlements: Collection(0) [Map] {},
  authorizingIntegrationOwners: { '0': '1406109276447178864' },
  context: 0,
  attachmentSizeLimit: 10485760,
  message: <ref *1> Message {
    channelId: '1413172369471574128',
    guildId: '1406109276447178864',
    id: '1413172373254836285',
    createdTimestamp: 1756996949257,
    type: 0,
    system: false,
    content: '',
    author: ClientUser {
      id: '1412079610815844543',
      bot: true,
      system: false,
      flags: [UserFlagsBitField],
      username: 'bot001',
      globalName: null,
      discriminator: '1285',
      avatar: 'ff2336a9e0a3107b2ef4d602935f332d',
      banner: undefined,
      accentColor: undefined,
      avatarDecoration: null,
      avatarDecorationData: null,
      collectibles: null,
      primaryGuild: null,
      verified: true,
      mfaEnabled: false
    },
    pinned: false,
    tts: false,
    nonce: null,
    embeds: [ [Embed] ],
    components: [ [ActionRow], [ActionRow], [ActionRow] ],
    attachments: Collection(0) [Map] {},
    stickers: Collection(0) [Map] {},
    position: 1,
    roleSubscriptionData: null,
    resolved: { members: [Collection [Map]], users: [Collection [Map]] },
    editedTimestamp: null,
    reactions: ReactionManager { message: [Circular *1] },
    mentions: MessageMentions {
      everyone: false,
      users: Collection(0) [Map] {},
      roles: Collection(0) [Map] {},
      _members: null,
      _channels: null,
      _parsedUsers: null,
      crosspostedChannels: Collection(0) [Map] {},
      repliedUser: null
    },
    webhookId: null,
    groupActivityApplication: null,
    applicationId: null,
    activity: null,
    flags: MessageFlagsBitField { bitfield: 0 },
    reference: null,
    interactionMetadata: null,
    interaction: null,
    poll: null,
    messageSnapshots: Collection(0) [Map] {},
    call: null
  },
  customId: 'profile_kinks',
  componentType: 2,
  deferred: false,
  ephemeral: null,
  replied: false,
  webhook: InteractionWebhook { id: '1412079610815844543' }
}
"""

    # Remote version (conflict resolution - commented out)
    # js_object_str = """
    #           type: 'order',
    #           func: 'handleAdjustmentPaymentSuccess',
    #           adjustmentId: order,
    #           paymentData: {
    #             outTradeNo: out_trade_no,
    #             transactionId: transaction_id,
    #             totalAmount: order
    #           }
    #         }  
    # """

    try:
        json_result = js_to_json(js_object_str)
        print("转换成功：")
        print(json_result)
    except Exception as e:
        print(f"错误：{str(e)}")
