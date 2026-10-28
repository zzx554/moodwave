// 情绪 × 策略 × 关键词变体：既是实时检索词，也是构建时曲库快照的分组键
export const QUERY_BANK = {
  happy: {
    resonate: ['欢快 流行', '开心 舞曲', '阳光 电子'],
    regulate: ['治愈 轻音乐', '温暖 民谣', '舒缓 钢琴'],
  },
  neutral: {
    resonate: ['安静 轻音乐', '氛围 电子', '慵懒 爵士'],
    regulate: ['温暖 灵魂乐', '独立 民谣', '轻柔 爵士'],
  },
  surprised: {
    resonate: ['节奏感 电子', '活力 流行', '电音 舞曲'],
    regulate: ['舒缓 钢琴', '梦幻 独立', '轻电子'],
  },
  sad: {
    resonate: ['伤感 民谣', '悲伤 钢琴', '慢歌 抒情'],
    regulate: ['治愈 民谣', '温暖 钢琴', '励志 流行'],
  },
  angry: {
    resonate: ['摇滚 燃', '高能 电子', '说唱 硬核'],
    regulate: ['放松 轻音乐', '安静 钢琴', '舒缓 民谣'],
  },
  fearful: {
    resonate: ['暗黑 氛围', '悬疑 配乐', '低沉 电子'],
    regulate: ['安抚 钢琴', '安全 氛围', '温柔 民谣'],
  },
  disgusted: {
    resonate: ['蓝调 摇滚', '另类 摇滚', '工业 电子'],
    regulate: ['清新 流行', '干净 民谣', '轻盈 电子'],
  },
}
