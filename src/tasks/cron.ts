import { crawlDguCoopFloor1 } from './dgucoop/floor-1';
import { crawlDguCoopFloor2 } from './dgucoop/floor-2';
import { crawlDguCoopFloor3 } from './dgucoop/floor-3';
import type { Meal } from '../types/meal';

export async function updateMealsCron() {
  // 1. 생협 크롤링(상록원 1층, 2층, 3층)
  const floor1Meals = await crawlDguCoopFloor1(1761663600);
  console.log('Floor 1 Meals:', floor1Meals.length);
  const floor2Meals = await crawlDguCoopFloor2(1761663600);
  console.log('Floor 2 Meals:', floor2Meals.length);
  const floor3Meals = await crawlDguCoopFloor3(1761836400); // 1761750000
  console.log('Floor 3 Meals:', floor3Meals.length);
}

updateMealsCron();
