import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

export interface DateResult {
  date: string // "YYYY-MM-DD"
  time: string | null // "HH:mm"
  matchedText: string
}

// 中文数字映射
const CN_NUM: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '两': 2,
}

const WEEKDAY_MAP: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0,
}

interface DatePattern {
  pattern: RegExp
  parse: (match: RegExpMatchArray) => { date: dayjs.Dayjs; time: string | null }
}

const DATE_PATTERNS: DatePattern[] = [
  // 昨天/前天/大前天
  {
    pattern: /大前天/,
    parse: () => ({ date: dayjs().subtract(3, 'day'), time: null }),
  },
  {
    pattern: /前天/,
    parse: () => ({ date: dayjs().subtract(2, 'day'), time: null }),
  },
  {
    pattern: /昨天/,
    parse: () => ({ date: dayjs().subtract(1, 'day'), time: null }),
  },
  // 今天/刚才
  {
    pattern: /今天|刚才|刚刚/,
    parse: () => ({ date: dayjs(), time: null }),
  },
  // N天前
  {
    pattern: /(\d+|[一二两三四五六七八九十]+)天前/,
    parse: (m) => {
      const n = CN_NUM[m[1]] || parseInt(m[1])
      return { date: dayjs().subtract(n, 'day'), time: null }
    },
  },
  // 上周X / 上(周|个)(星期|周)X
  {
    pattern: /上[周个]?(?:星期|周)([一二三四五六日天])/,
    parse: (m) => {
      const targetDay = WEEKDAY_MAP[m[1]]
      const today = dayjs().day()
      const daysBack = (today - targetDay + 7) % 7 + 7
      return { date: dayjs().subtract(daysBack, 'day'), time: null }
    },
  },
  // 这周X / (这)?(周|星期)X
  {
    pattern: /(?:这[周个]?)?(?:星期|周)([一二三四五六日天])/,
    parse: (m) => {
      const targetDay = WEEKDAY_MAP[m[1]]
      const today = dayjs().day()
      const diff = targetDay - today
      return { date: dayjs().add(diff, 'day'), time: null }
    },
  },
  // X月X日/号
  {
    pattern: /(\d{1,2})月(\d{1,2})[日号]/,
    parse: (m) => ({
      date: dayjs().month(parseInt(m[1]) - 1).date(parseInt(m[2])),
      time: null,
    }),
  },
  // ISO 格式 YYYY-MM-DD 或 YYYY/MM/DD
  {
    pattern: /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
    parse: (m) => ({
      date: dayjs(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`),
      time: null,
    }),
  },
  // 时间提取 HH:mm
  {
    pattern: /(\d{1,2}):(\d{2})/,
    parse: (m) => ({
      date: dayjs(),
      time: `${m[1].padStart(2, '0')}:${m[2]}`,
    }),
  },
]

export function parseDate(text: string): DateResult {
  for (const { pattern, parse } of DATE_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const result = parse(match)
      return {
        date: result.date.format('YYYY-MM-DD'),
        time: result.time,
        matchedText: match[0],
      }
    }
  }

  // 默认：今天
  return {
    date: dayjs().format('YYYY-MM-DD'),
    time: null,
    matchedText: '',
  }
}
