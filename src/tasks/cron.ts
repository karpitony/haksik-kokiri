import { crawlDguCoop } from './dgu-coop'
import { ocrImage } from './ocr'
import type { Meal } from '../types/meal'

export async function updateMealsCron() {
  // 1. 생협 크롤링(상록원 1층, 2층, 3층)
  const meals = await crawlDguCoop()
}