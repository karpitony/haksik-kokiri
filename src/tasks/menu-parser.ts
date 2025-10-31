import { JSDOM } from "jsdom";
import { DayOfWeek, Restaurant, Meal, MenuItem } from "../types/meal";

export class MenuParser {
  // --- 매핑 상수 정의 ---
  private readonly dayOfWeekMap: { [key: string]: DayOfWeek } = {
    '일': 'sun', '월': 'mon', '화': 'tue', '수': 'wed', '목': 'thu', '금': 'fri', '토': 'sat'
  };

  private readonly mealTypeMap: { [key: string]: 'lunch' | 'dinner' } = {
    '중식': 'lunch',
    '석식': 'dinner'
  };

  private readonly restaurantDTOMap: { [key: string]: Restaurant } = {
    '상록원3층식당-집밥': '상록원3층식당 - 집밥',
    '상록원3층식당-한그릇(한정판매)': '상록원3층식당 - 한그릇(한정판매)',
    '상록원2층식당-일품코너': '상록원2층식당 - 일품코너',
    '상록원2층식당-양식코너': '상록원2층식당 - 양식코너',
    '상록원2층식당-뚝배기코너': '상록원2층식당 - 뚝배기코너',
  };

  // TARGET_RESTAURANTS는 이제 올바른 타입('일품코너')을 기반으로 생성됩니다.
  private readonly TARGET_RESTAURANTS: Set<Restaurant> = new Set([
    '상록원3층식당 - 집밥',
    '상록원3층식당 - 한그릇(한정판매)',
    '상록원2층식당 - 일품코너',
    '상록원2층식당 - 양식코너',
    '상록원2층식당 - 뚝배기코너',
    '솥앤누들',
    '분식당'
  ]);

  private parsePrice(text: string): number | undefined {
    const priceMatch = text.match(/￦\s*([\d,]+)/);
    if (priceMatch && priceMatch[1]) {
      return parseInt(priceMatch[1].replace(/,/g, ''), 10);
    }
    const linePriceMatch = text.match(/([\d,]+)원/);
    if (linePriceMatch && linePriceMatch[1]) {
        return parseInt(linePriceMatch[1].replace(/,/g, ''), 10);
    }
    return undefined;
  }

  private parseMenuCell(cell: HTMLTableCellElement): { items: MenuItem[] | null, status: 'open' | 'closed' | 'unavailable' } {
    const contentSpan = cell.querySelector<HTMLSpanElement>('span[style*="color:#303030"]');
    if (!contentSpan || !contentSpan.textContent?.trim()) {
      return { items: null, status: 'closed' };
    }

    const rawHtml = contentSpan.innerHTML;
    const wholeCellText = cell.textContent || '';
    
    if (rawHtml.includes('휴무')) {
      return { items: null, status: 'closed' };
    }

    // --- 전략 1: 세트 메뉴 (e.g., '집밥', '한그릇') ---
    const setPrice = this.parsePrice(wholeCellText);
    const lines = rawHtml.split(/<br\s*\/?>/gi)
                       .map(s => s.replace(/&amp;/g, '&').replace(/\(.*\)/g, '').replace(/<[^>]+>/g, '').trim())
                       .filter(s => s && !s.startsWith('**') && !s.includes('한정판매'));
    
    if (setPrice && lines.length > 0 && !lines.some(l => l.match(/([\d,]+)원/))) {
      return {
        items: [{ name: lines, price: setPrice }],
        status: 'open'
      };
    }

    // --- 전략 2: 개별 메뉴 리스트 (e.g., '양식코너', '솥앤누들') ---
    const menuItems: MenuItem[] = [];
    const rawLines = rawHtml.split(/<br\s*\/?>/gi)
                            .map(s => s.replace(/&amp;/g, '&').trim())
                            .filter(s => s && !s.startsWith('****') && !s.includes('~'));

    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];
      if (!line) continue;

      let price: number | undefined;
      
      const nextLine = rawLines[i + 1];
      const priceOnlyMatch = nextLine?.match(/^([\d,]+)원$/);
      
      if (priceOnlyMatch) {
        price = parseInt(priceOnlyMatch[1].replace(/,/g, ''), 10);
        i++;
      } else {
        const embeddedPriceMatch = line.match(/([\d,]+)원/);
        if (embeddedPriceMatch) {
          price = parseInt(embeddedPriceMatch[1].replace(/,/g, ''), 10);
          line = line.replace(/([\d,]+)원/, '').trim();
        }
      }
      
      line = line.replace(/\[NEW\]/g, '').replace(/\(.*\)/g, '').replace(/<[^>]+>/g, '').trim();
      
      if (line) {
        menuItems.push({ name: [line], price: price });
      }
    }

    if (menuItems.length === 0) {
       if (lines.length === 1 && setPrice) {
            return { items: [{ name: [lines[0]], price: setPrice }], status: 'open' };
       }
      return { items: null, status: 'unavailable' };
    }
    
    return { items: menuItems, status: 'open' };
  }

  private parseConstantMenu(
    row: HTMLTableRowElement, 
    restaurant: Restaurant,
    allMeals: Meal[],
    dataStartIndex: number
  ) {
    if (!this.TARGET_RESTAURANTS.has(restaurant)) return;
    
    let dataCell: HTMLTableCellElement | undefined;
    for (let i = dataStartIndex; i < row.cells.length; i++) {
      if (row.cells[i]?.textContent?.trim()) {
        dataCell = row.cells[i];
        break;
      }
    }

    if (!dataCell) return;

    const { items, status } = this.parseMenuCell(dataCell);

    const targetDays: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const targetMealTypes: ('lunch' | 'dinner')[] = ['lunch', 'dinner'];
    const updatedAt = new Date().toISOString();

    for (const day of targetDays) {
      for (const mealType of targetMealTypes) {
        allMeals.push({
          restaurant: restaurant,
          day: day,
          mealType: mealType,
          items: items,
          status: status,
          updatedAt: updatedAt
        });
      }
    }
  }

  public parseMenu(html: string): Meal[] {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const allMeals: Meal[] = [];
    const dayColumnMap = new Map<number, DayOfWeek>();

    let currentRestaurantSection = '';
    let currentCornerName = '';
    
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody > tr'));

    // 1. 요일 헤더를 찾아 dayColumnMap 생성
    const headerRow = rows.find(r => r.cells[3]?.innerHTML.includes('월<br>'));
    if (headerRow) {
      for (let i = 2; i <= 8; i++) { // 2:일 ~ 8:토
        const dayChar = headerRow.cells[i]?.textContent?.trim().charAt(0);
        if (dayChar && this.dayOfWeekMap[dayChar]) {
          dayColumnMap.set(i, this.dayOfWeekMap[dayChar]);
        }
      }
    }
    
    // 2. 모든 행을 순회하며 파싱
    for (const row of rows) {
      const firstCell = row.cells[0];
      if (!firstCell) continue;

      // --- 레스토랑 섹션 헤더 (e.g., '상록원3층식당') ---
      if (firstCell.classList.contains('menu_st')) {
        currentRestaurantSection = firstCell.textContent?.trim() || '';
        currentCornerName = '';
        continue;
      }

      // [FIX 1] --- 날짜 헤더 행 스킵 로직 수정 ---
      // 'colspan="2"'과 '코너' 텍스트를 모두 만족하는 행만 건너뜀
      if (firstCell.getAttribute('colspan') === '2' && firstCell.textContent?.includes('코너')) {
        continue;
      }
      
      // --- 코너 이름 업데이트 ---
      if (firstCell.hasAttribute('rowspan')) {
        const firstCellText = firstCell.textContent?.replace(/\s+/g, '').trim() || '';
        if (firstCellText !== '석식') {
            currentCornerName = firstCellText;
        }
      }

      // --- '솥앤누들' / '분식당' 파싱 ---
      if (currentRestaurantSection.includes('솥앤누들')) {
        if (currentCornerName === '메뉴') {
            const mondayCell = row.cells[3]; // 월요일(index 3) 셀
            if (mondayCell?.textContent?.includes('****분식당****')) {
                this.parseConstantMenu(row, '분식당', allMeals, 3);
            } else if (mondayCell?.textContent?.includes('삼겹살김치철판')) {
                this.parseConstantMenu(row, '솥앤누들', allMeals, 3);
            }
        }
        continue; 
      }

      // --- 4. 일반 케이스: '집밥', '일품코너' 등 (중식/석식) ---
      let mealTypeCell: HTMLTableCellElement | undefined;
      let dataStartIndex: number;

      if (firstCell.hasAttribute('rowspan')) {
        mealTypeCell = row.cells[1];
        dataStartIndex = 2;
      } else {
        mealTypeCell = row.cells[0];
        dataStartIndex = 1;
      }

      const mealTypeStr = mealTypeCell?.textContent?.trim() || '';
      const mealType = this.mealTypeMap[mealTypeStr];
      if (!mealType) continue;

      const restaurantKey = `${currentRestaurantSection}-${currentCornerName}`;
      const restaurantName = this.restaurantDTOMap[restaurantKey];

      if (!restaurantName || !this.TARGET_RESTAURANTS.has(restaurantName)) {
        continue;
      }

      const updatedAt = new Date().toISOString();

      // --- 요일별(열별) 데이터 파싱 ---
      for (const [colIndex, day] of dayColumnMap.entries()) {
        let cell: HTMLTableCellElement | undefined;
        if (dataStartIndex === 2) {
            cell = row.cells[colIndex];
        } else {
            cell = row.cells[colIndex - 1];
        }

        if (!cell || !day) continue;
        
        const { items, status } = this.parseMenuCell(cell);
        
        allMeals.push({
          restaurant: restaurantName,
          day: day,
          mealType: mealType,
          items: items,
          status: status,
          updatedAt: updatedAt
        });
      }
    }

    return allMeals;
  }
}