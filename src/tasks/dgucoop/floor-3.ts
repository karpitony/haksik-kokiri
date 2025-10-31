import { JSDOM } from 'jsdom';
import { DayOfWeek, Restaurant, Meal, MenuItem } from '../../types/meal';
import { getDayOfWeek } from '../utils/day';
import { fetchAndParse } from '../utils/crawler';

// 파싱 대상 레스토랑 목록 (DTO 기준)
const TARGET_RESTAURANTS_FLOOR3: Set<Restaurant> = new Set([
  '상록원3층식당 - 집밥',
  '상록원3층식당 - 한그릇(한정판매)',
]);

// HTML '구분' 텍스트 -> DTO Restaurant 이름 매핑
const restaurantMapFloor3: { [key: string]: Restaurant } = {
  집밥: '상록원3층식당 - 집밥',
  '한그릇(한정판매)': '상록원3층식당 - 한그릇(한정판매)',
};

/**
 * 2층/3층 메뉴 셀(<td>)의 innerHTML을 파싱하여 MenuItem 배열로 변환
 */
function parseMenuCellFloor3(cellHtml: string): {
  items: MenuItem[];
  status: 'open' | 'closed' | 'unavailable';
  notes?: string;
} {
  // 휴무 또는 빈 셀 감지
  const cellText = cellHtml.replace(/<[^>]+>/g, '').trim();
  if (cellText.includes('휴무')) {
    return { items: [], status: 'closed', notes: cellText }; // "휴무"는 notes로 전달
  }
  if (!cellText) {
    return { items: [], status: 'closed', notes: undefined }; // 빈 칸은 notes 없이 'closed'
  }

  const items: MenuItem[] = [];

  // 1. 전체 텍스트에서 영업시간 추출
  const timeRegex = /(\d{2}:\d{2}~\d{2}:\d{2}(\s*\/\s*\d{2}:\d{2}~\d{2}:\d{2})?)/;
  const timeMatch = cellHtml.match(timeRegex);
  const operatingHours = timeMatch ? timeMatch[1] : undefined;

  // 2. 전체 텍스트에서 세트 메뉴 가격(￦ 4,500) 추출
  const setPriceMatch = cellHtml.match(/￦\s*([\d,]+)/);
  const setPrice = setPriceMatch ? parseInt(setPriceMatch[1].replace(/,/g, ''), 10) : undefined;

  const lines = cellHtml.split(/<br\s*\/?>/gi);

  if (setPrice) {
    // --- Case 1: '집밥', '한그릇' (세트 메뉴 스타일) ---
    const menuNames: string[] = [];
    for (let line of lines) {
      line = line
        .replace(/<span.*<\/span>/gi, '') // 원산지 span
        .replace(/<[^>]+>/g, '') // 기타 태그
        .replace(/\(.*\)/g, '') // (원산지), (품절시까지), (한정판매) 등
        .replace(timeRegex, '') // 시간
        .replace(/￦\s*([\d,]+)/, '') // 가격
        .replace(/\*자율배식\*/g, '') // *자율배식*
        .replace(/배추김치\/단무지/g, '') // 김치/단무지
        .replace(/\*\*12시부터 한정판매/g, '') // 한정판매 텍스트
        .trim();

      if (line) {
        if (line.includes('*')) {
          const subItems = line
            .split('*')
            .map(s => s.trim())
            .filter(Boolean);
          menuNames.push(...subItems);
        } else if (line.includes('&')) {
          const subItems = line
            .split('&')
            .map(s => s.trim())
            .filter(Boolean);
          menuNames.push(...subItems);
        } else {
          menuNames.push(line);
        }
      }
    }
    if (menuNames.length > 0) {
      items.push({
        name: menuNames,
        price: setPrice,
        openAndCloseTime: operatingHours,
      });
    }
  } else {
    // --- Case 2: '양식', '뚝배기' (3층에는 없음) ---
    const singleLine = lines
      .join(' ')
      .replace(/<span.*<\/span>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(timeRegex, '')
      .replace(/-더진국-/g, '')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

    const menuRegex = /(.*?)([\d,]+원)/g;
    let match;
    let foundMatches = false;

    while ((match = menuRegex.exec(singleLine)) !== null) {
      foundMatches = true;
      let name = match[1].trim();
      const priceStr = match[2];

      name = name
        .replace(/\(\d{2}:\d{2}~\d{2}:\d{2}\)/g, '')
        .replace(/\(한정판매\)/g, '')
        .replace(/\[NEW\]/gi, '')
        .trim();

      if (!name) continue;

      if (name.includes('/')) {
        const names = name.split('/');
        for (let subName of names) {
          subName = subName.replace(/\[NEW\]/gi, '').trim();
          if (subName) {
            items.push({
              name: [subName],
              price: parseInt(priceStr.replace(/[^\d]/g, ''), 10),
              openAndCloseTime: operatingHours,
            });
          }
        }
      } else {
        items.push({
          name: [name],
          price: parseInt(priceStr.replace(/[^\d]/g, ''), 10),
          openAndCloseTime: operatingHours,
        });
      }
    }

    if (!foundMatches) {
      for (let i = 0; i < lines.length; i++) {
        let nameLine = lines[i]
          .replace(/<[^>]+>/g, '')
          .replace(timeRegex, '')
          .trim();
        if (!nameLine) continue;

        const nextLine = lines[i + 1] || '';
        const nextLinePriceMatch = nextLine.trim().match(/^([\d,]+)원$/);

        if (nextLinePriceMatch) {
          const price = parseInt(nextLinePriceMatch[1].replace(/,/g, ''), 10);
          i++;

          nameLine = nameLine
            .replace(/\(.*\)/g, '')
            .replace(/\[NEW\]/gi, '')
            .trim();
          if (nameLine) {
            items.push({
              name: [nameLine],
              price: price,
              openAndCloseTime: operatingHours,
            });
          }
        }
      }
    }
  }

  // 파싱은 성공했으나 메뉴 아이템이 없는 경우 (e.g. 가격 정보 누락)
  if (items.length === 0) {
    return { items: [], status: 'unavailable', notes: '메뉴 정보 없음' };
  }

  return { items, status: 'open' };
}

/**
 * 3층(집밥, 한그릇) 테이블 HTML을 파싱합니다.
 * @param tableHtml - 파싱할 <table>의 outerHTML
 * @param date - 이 메뉴가 해당하는 날짜 (요일 계산용)
 */
function parseFloor3Menu(tableHtml: string, date: Date): Meal[] {
  const dom = new JSDOM(tableHtml);
  const document = dom.window.document;
  const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody > tr'));

  const allMeals: Meal[] = [];
  const day = getDayOfWeek(date);
  const updatedAt = new Date().toISOString();

  for (const row of rows) {
    const headerCell = row.cells[0];
    const lunchCell = row.cells[1];
    const dinnerCell = row.cells[2];

    if (!headerCell || !lunchCell || !dinnerCell || headerCell.textContent?.trim() === '구분') {
      continue;
    }

    const cornerName = headerCell.textContent
      ?.replace(/<br\s*\/?>/gi, '')
      .replace(/\s+/g, '')
      .trim();
    if (!cornerName) continue;

    const restaurant = restaurantMapFloor3[cornerName];

    if (!restaurant || !TARGET_RESTAURANTS_FLOOR3.has(restaurant)) {
      continue;
    }

    // 중식 파싱
    const lunchCellHtml = lunchCell.innerHTML.trim();
    const {
      items: lunchItems,
      status: lunchStatus,
      notes: lunchNotes,
    } = parseMenuCellFloor3(lunchCellHtml);

    if (lunchStatus === 'open' && lunchItems.length > 0) {
      allMeals.push({
        restaurant,
        day,
        mealType: 'lunch',
        items: lunchItems,
        status: 'open',
        updatedAt,
      });
    } else if (lunchStatus !== 'open') {
      // 'closed' or 'unavailable'
      allMeals.push({
        restaurant,
        day,
        mealType: 'lunch',
        items: null,
        status: lunchStatus,
        notes: lunchNotes, // 휴무 사유 추가
        updatedAt,
      });
    }

    // 석식 파싱
    const dinnerCellHtml = dinnerCell.innerHTML.trim();
    const {
      items: dinnerItems,
      status: dinnerStatus,
      notes: dinnerNotes,
    } = parseMenuCellFloor3(dinnerCellHtml);

    if (dinnerStatus === 'open' && dinnerItems.length > 0) {
      allMeals.push({
        restaurant,
        day,
        mealType: 'dinner',
        items: dinnerItems,
        status: 'open',
        updatedAt,
      });
    } else if (dinnerStatus !== 'open') {
      // 'closed' or 'unavailable'
      allMeals.push({
        restaurant,
        day,
        mealType: 'dinner',
        items: null,
        status: dinnerStatus,
        notes: dinnerNotes, // 휴무 사유 추가
        updatedAt,
      });
    }
  }

  return allMeals;
}

/**
 * sday 타임스탬프를 기반으로 동국대 생협 3층(code=5) 모바일 메뉴를 크롤링합니다.
 * @param sday - 대상 날짜의 UTC 자정 Unix 타임스탬프 (초 단위)
 */
export async function crawlDguCoopFloor3(sday: number): Promise<Meal[]> {
  return fetchAndParse(3, sday, parseFloor3Menu);
}
