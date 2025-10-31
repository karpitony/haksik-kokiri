import { DayOfWeek } from '../../types/meal';

export function getDayOfWeek(date: Date): DayOfWeek {
  const dayIndex = date.getDay(); // 0(일) ~ 6(토)
  const days: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[dayIndex];
}
