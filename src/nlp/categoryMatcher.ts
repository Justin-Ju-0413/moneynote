export interface CategoryResult {
  category: string
  confidence: 'high' | 'medium' | 'low'
  matchedKeyword: string
}

// 内嵌关键词词典
const BUILTIN_KEYWORDS: Record<string, string[]> = {
  food: [
    '早餐', '午餐', '午饭', '晚餐', '晚饭', '吃饭', '外卖', '咖啡', 'coffee',
    '奶茶', '火锅', '烧烤', '快餐', '水果', '零食', '饮料', '茶', '买菜', '做饭',
    '麦当劳', '肯德基', '星巴克', 'starbucks', 'kfc', '宵夜', '面条', '米饭',
    '汉堡', '披萨', '米线', '粉面', '粥', '豆浆', '包子', '饺子', '炸鸡',
    '蛋糕', '面包', '甜品', '寿司', '拉面', '炒菜', '盖浇饭', '便当',
    '美团', '饿了么', '食堂', '小吃', '面馆', '餐馆', '饭店', '饮品',
    // 银行账单常见商户
    '吉野家', '真功夫', '永和豆浆', '点餐', '牛肉店', '串串', '鸡煲',
    '糖水', '茶饮', '肠粉', '炖汤', '潮汕', '猪脚', '卤味', '麻辣烫',
    '黄焖鸡', '沙拉', '轻食', '云吞', '米粉', '酸辣粉', '冒菜',
  ],
  transport: [
    '打车', '地铁', '公交', '加油', '停车', '滴滴', 'taxi', 'uber', '高铁',
    '火车', '机票', '飞机', '自行车', '共享单车', '过路费', '充电', '高速',
    '油费', '出行', '出租车', '摩拜', '哈啰', '骑车', '开车',
    '停车场', '停车费', '充电桩', '充电站', 'etc', '网约车', '代驾',
    '航空', '铁路', '12306', '携程', '去哪儿', '飞猪',
    // 银行账单常见
    '岭南通', '公交卡', '交通卡', '嘀嘀', '高德', '神州租车', '一嗨',
    '租车', '特来电', '云快充', '新电途', '顺风车',
  ],
  shopping: [
    '衣服', '裤子', '鞋', '包', '淘宝', '京东', '拼多多', '超市', '购物',
    '数码', '手机', '电脑', '护肤', '化妆', '日用', '洗护', '裙子', '外套',
    '帽子', '眼镜', '手表', '饰品', '礼物', '礼品',
    '天猫', '唯品会', '苏宁', '亚马逊', 'amazon', '苹果', 'apple',
    '母婴', '尿不湿', '奶粉', '婴儿',
    // 银行账单常见
    '名创优品', '屈臣氏', '万达', '便利店', '百货', '商城', '小米',
    '华为', 'oppo', 'vivo', '荣耀', '三星', '联想',
  ],
  entertainment: [
    '电影', '游戏', 'ktv', '唱歌', '演出', '门票', '游乐', '旅游', '景点',
    '酒店', '民宿', '健身', '游泳', 'spa', '足浴', '按摩', '剧本杀',
    '密室', '展览', '演唱会', '话剧', '酒吧', '夜店',
    'app store', 'steam', '百度网盘', '网易云', 'spotify', 'netflix',
    'bilibili', '哔哩哔哩', '优酷', '爱奇艺', '腾讯视频', '会员',
    '抖音', '快手', '小红书',
    // 银行账单常见
    'apple music', '网吧', '温泉', '景区', '公园', '棋牌', '电竞',
    'deepseek', '深度求索',
  ],
  housing: [
    '房租', '租金', '水费', '电费', '水电气', '物业', '物业费', '装修',
    '家具', '家电', '维修', '宽带', '网费', '房贷', '月供', '燃气',
    '暖气', '供暖', '电费', '自来水', '家政', '保洁',
  ],
  medical: [
    '看病', '医院', '药', '药店', '体检', '牙科', '眼科', '门诊', '住院',
    '挂号', '检查', '手术', '保险', '医疗', '感冒', '发烧',
    '核酸', '疫苗', '中药', '西药', '药房', '诊所', '康复',
    // 银行账单常见
    '海王星辰', '大参林', '国大药房', '快药店', '健之佳',
  ],
  education: [
    '书', '书籍', '课程', '培训', '学费', '文具', '考试', '报名', '学习',
    '网课', '教材', '补习', '家教', '辅导',
    '学历认证', '学信', '教育部', '学位', '毕业证', '考研', '公务员',
    '驾校', '学车',
  ],
}

export function matchCategory(text: string): CategoryResult {
  const lowerText = text.toLowerCase()
  const scores: Record<string, { score: number; keyword: string }> = {}

  for (const [category, keywords] of Object.entries(BUILTIN_KEYWORDS)) {
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase()
      if (lowerText.includes(lowerKeyword)) {
        const currentScore = scores[category]?.score || 0
        // 完全匹配（关键词长度越长，权重越高）
        const score = currentScore + 10 + lowerKeyword.length
        if (!scores[category] || score > scores[category].score) {
          scores[category] = { score, keyword }
        }
      }
    }
  }

  // 找到最高分
  let bestCategory = 'other'
  let bestScore = 0
  let bestKeyword = ''

  for (const [category, { score, keyword }] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score
      bestCategory = category
      bestKeyword = keyword
    }
  }

  // 根据分数判断置信度
  let confidence: 'high' | 'medium' | 'low' = 'low'
  if (bestScore >= 15) {
    confidence = 'high'
  } else if (bestScore >= 10) {
    confidence = 'medium'
  }

  return {
    category: bestCategory,
    confidence,
    matchedKeyword: bestKeyword,
  }
}
