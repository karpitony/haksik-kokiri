export type DayOfWeek = 
  | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type Restaurant = 
  | '상록원3층식당 - 집밥' 
  | '상록원3층식당 - 한그릇(한정판매)'
  | '상록원2층식당 - 일품코너' 
  | '상록원2층식당 - 양식코너' 
  | '상록원2층식당 - 뚝배기코너' 
  | '솥앤누들' 
  | '분식당' 
  | '누리터식당' 
  | '남산학사 기숙사 식당' 
  | '경영관 D-flex'

export interface MenuItem {
  name: string[]             // 메뉴 이름 배열 (단일 음식도 배열로)
  price?: number             // 가격이 없을 수도 있음
  notes?: string             // 부가 정보 (ex. 매운맛, 비건 등)
}

export interface Meal {
  restaurant: Restaurant      // 식당 이름
  day: DayOfWeek             // 요일
  mealType: 'breakfast' | 'lunch' | 'dinner'
  items: MenuItem[]          // 메뉴 리스트
  updatedAt?: string         // 마지막 갱신일
}
