import { JSDOM } from 'jsdom';
import { DayOfWeek, Restaurant, Meal, MenuItem } from '../../types/meal';
import { getDayOfWeek } from '../utils/day';
import { fetchAndParse } from '../utils/crawler';

/**
 * 영업시간 문자열(예: "10:00~14:00")을 기반으로 'lunch', 'dinner', 'both'를 반환
 * 15:00 이전을 중식, 15:00 이후를 석식으로 구분.
 * @param timeString - "HH:MM~HH:MM" 형식의 문자열
 */
function getMealTypeFromTime(timeString: string | undefined): 'lunch' | 'dinner' | 'both' {
  if (!timeString) {
    // 시간이 명시되지 않은 메뉴 (e.g. 분식당의 라면)는
    // 해당 코너의 기본 운영시간을 따른다고 가정. (분식당은 10:00~14:00)
    // 솥앤누들(11:00~19:00)과 시간이 겹칠 수 있으므로 'both'로 처리하는 것이 안전.
    return 'both';
  }

  // "10:00~14:00" 형식 매칭
  const timeMatch = timeString.match(/^(\d{2}):(\d{2})~(\d{2}):(\d{2})$/);
  if (!timeMatch) {
    return 'both'; // "11:30~13:50(한정판매)" 같은 예외 케이스 방지
  }

  const startHour = parseInt(timeMatch[1], 10);
  const endHour = parseInt(timeMatch[3], 10);

  const lunchCutoff = 15; // 15:00

  // 10:00 < 15:00 (true)
  const isLunch = startHour < lunchCutoff;
  // 14:00 >= 15:00 (false)
  // 19:00 >= 15:00 (true)
  const isDinner = endHour >= lunchCutoff;

  if (isLunch && isDinner) {
    return 'both'; // e.g., 11:00~19:00
  }
  if (isLunch) {
    return 'lunch'; // e.g., 10:00~14:00
  }
  if (isDinner) {
    return 'dinner'; // e.g., 16:30~19:00
  }
  return 'both';
}

/**
 * 메뉴 셀(<td>)의 innerHTML을 파싱하여 MenuItem 배열과 영업시간을 반환
 * @param cellHtml - "11:00~19:00<br>삼겹살김치철판<br>6000원<br>..."
 * @returns { items: MenuItem[] }
 */
function parseMenuCell(cellHtml: string): { items: MenuItem[] } {
  const items: MenuItem[] = [];
  let currentOperatingHours: string | undefined = undefined;
  const lines = cellHtml.split(/<br\s*\/?>/gi);

  // [수정] 영업 시간 형식을 감지하는 정규식 (줄의 시작 부분만)
  const timeRegex = /^(\d{2}:\d{2}~\d{2}:\d{2})/;

  for (let i = 0; i < lines.length; i++) {
    // 1. HTML 태그(원산지 span 등), (원산지), 헤더 텍스트 제거
    let nameLine = lines[i]
      .replace(/<span.*<\/span>/gi, '') // 원산지 span 제거
      .replace(/<[^>]+>/g, '') // 기타 태그
      .replace(/\(.*\)/g, '') // (원산지)
      .replace(/\*{4}분식당\*{4}/g, '') // 분식당 헤더
      .replace(/NEW 쌀국수/g, '쌀국수') // "NEW " 제거
      .trim();

    if (!nameLine) continue;

    // 1.5. 영업 시간인지 확인
    // "11:30~13:50(한정판매)" 같은 경우 "11:30~13:50"만 추출
    const timeMatch = nameLine.match(timeRegex);
    if (timeMatch) {
      currentOperatingHours = timeMatch[1]; // 시간 부분만 추출하여 현재 시간으로 업데이트
      continue; // 영업 시간이므로 메뉴 항목으로 처리하지 않음
    }

    // 2. 가격("6000원") 파싱
    const sameLinePriceMatch = nameLine.match(/([\d,]+)원/);
    let price: number | undefined;

    if (sameLinePriceMatch) {
      // Case 1: "데리야끼치킨솥밥 5500원" (가격이 같은 줄에 있음)
      price = parseInt(sameLinePriceMatch[1].replace(/,/g, ''), 10);
      nameLine = nameLine.replace(sameLinePriceMatch[0], '').trim(); // 이름에서 가격 제거
    } else {
      // Case 2: "삼겹살김치철판" (가격이 다음 줄에 있을 수 있음)
      const nextLine = lines[i + 1] || '';
      // 다음 줄이 "6000원" 처럼 가격만 있는지 확인
      const nextLinePriceMatch = nextLine.trim().match(/^([\d,]+)원$/);

      if (nextLinePriceMatch) {
        price = parseInt(nextLinePriceMatch[1].replace(/,/g, ''), 10);
        i++;
      }
      // 다음 줄에 가격이 없으면 price는 undefined
    }

    // 이름이 있는 경우에만 추가 (e.g., "6000원"만 있던 줄, 영업시간 줄 제외)
    if (nameLine) {
      items.push({
        name: [nameLine],
        price: price,
        openAndCloseTime: currentOperatingHours, // 현재 영업시간을 메뉴 항목에 할당
      });
    }
  }
  return { items };
}

/**
 * 1층(솥앤누들, 분식당) 테이블 HTML을 파싱
 * @param tableHtml - 파싱할 <table>의 outerHTML
 * @param date - 이 메뉴가 해당하는 날짜 (요일 계산용)
 */
function parseFloor1Menu(tableHtml: string, date: Date): Meal[] {
  const dom = new JSDOM(tableHtml);
  const document = dom.window.document;
  const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody > tr'));

  const allMeals: Meal[] = [];
  const day = getDayOfWeek(date);
  const updatedAt = new Date().toISOString();

  for (const row of rows) {
    const headerCell = row.cells[0];
    const menuCell = row.cells[1];

    // '구분' 헤더 행이거나, 셀이 2개가 아니면 건너뛰기
    if (!headerCell || !menuCell || headerCell.textContent?.trim() === '구분') {
      continue;
    }

    const headerText = headerCell.textContent?.trim();
    const menuCellHtml = menuCell.innerHTML.trim();

    let restaurant: Restaurant | undefined;

    if (headerText === '메뉴1' && menuCellHtml) {
      restaurant = '솥앤누들';
    } else if (headerText === '메뉴2' && menuCellHtml) {
      restaurant = '분식당';
    } else {
      continue; // 메뉴3~7 또는 빈 셀 건너뛰기
    }

    const { items } = parseMenuCell(menuCellHtml);
    if (items.length === 0) continue;

    // [수정] 중/석식 분리 로직
    const lunchItems: MenuItem[] = [];
    const dinnerItems: MenuItem[] = [];

    for (const item of items) {
      // [신규] 헬퍼 함수를 호출하여 시간대 판별
      const mealType = getMealTypeFromTime(item.openAndCloseTime);

      if (mealType === 'lunch' || mealType === 'both') {
        lunchItems.push(item);
      }
      if (mealType === 'dinner' || mealType === 'both') {
        dinnerItems.push(item);
      }
    }

    if (lunchItems.length > 0) {
      allMeals.push({
        restaurant,
        day,
        mealType: 'lunch',
        items: lunchItems,
        status: 'open',
        updatedAt,
      });
    }
    if (dinnerItems.length > 0) {
      allMeals.push({
        restaurant,
        day,
        mealType: 'dinner',
        items: dinnerItems,
        status: 'open',
        updatedAt,
      });
    }
  }

  return allMeals;
}

/**
 * sday 타임스탬프를 기반으로 동국대 생협 1층(code=7) 모바일 메뉴를 크롤링
 * @param sday - 대상 날짜의 UTC 자정 Unix 타임스탬프 (초 단위)
 */
export async function crawlDguCoopFloor1(sday: number): Promise<Meal[]> {
  return fetchAndParse(1, sday, parseFloor1Menu);
}
