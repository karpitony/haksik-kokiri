import { JSDOM } from 'jsdom';
import { DayOfWeek, Restaurant, Meal, MenuItem } from "../../types/meal";
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs'; 
import * as path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 파싱 대상 레스토랑 목록 (DTO 기준)
const TARGET_RESTAURANTS_FLOOR2: Set<Restaurant> = new Set([
  '상록원2층식당 - 일품코너',
  '상록원2층식당 - 양식코너',
  '상록원2층식당 - 뚝배기코너',
]);

const restaurantMapFloor2: { [key: string]: Restaurant } = {
  '일품': '상록원2층식당 - 일품코너',
  '양식': '상록원2층식당 - 양식코너',
  '뚝배기': '상록원2층식당 - 뚝배기코너',
};

/**
 * Date 객체에서 'mon', 'tue' 등을 가져오는 헬퍼
 */
function getDayOfWeek(date: Date): DayOfWeek {
  const dayIndex = date.getDay(); // 0(일) ~ 6(토)
  const days: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[dayIndex];
}

/**
 * 2층 식당 메뉴 셀(<td>)의 innerHTML을 파싱하여 MenuItem 배열로 변환
 * @param cellHtml - "11:00~14:00...<br>낙삼덮밥...<br>￦ 4,500"
 */
function parseMenuCellFloor2(cellHtml: string): { items: MenuItem[] } {
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
    // --- Case 1: '일품' 코너 (세트 메뉴 스타일) ---
    const menuNames: string[] = [];
    for (let line of lines) {
      line = line.replace(/<span.*<\/span>/gi, '')  // 원산지 span
                 .replace(/<[^>]+>/g, '')           // 기타 태그
                 .replace(/\(.*\)/g, '')            // (원산지), (품절시까지) 등
                 .replace(timeRegex, '')            // 시간
                 .replace(/￦\s*([\d,]+)/, '')       // 가격
                 .replace(/\*자율배식\*/g, '')        // *자율배식*
                 .replace(/배추김치\/단무지/g, '')      // 김치/단무지
                 .trim();
      
      if (line) {
        // "낙삼덮밥*요구르트" -> ["낙삼덮밥", "요구르트"]
        if (line.includes('*')) {
          const subItems = line.split('*').map(s => s.trim()).filter(Boolean);
          menuNames.push(...subItems);
        } else {
          // "낙삼덮밥" (단일 메뉴일 경우)
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
    // --- Case 2: '양식', '뚝배기' 코너 (개별 메뉴 리스트 스타일) ---
    // [MODIFIED BLOCK] <br>을 공백으로 바꾸고, 정규식으로 (메뉴+가격) 쌍을 모두 추출
    
    // 1. <br>을 공백으로 치환하여 한 줄로 만듦
    const singleLine = lines.join(' ')
                            .replace(/<span.*<\/span>/gi, '') // 원산지 span
                            .replace(/<[^>]+>/g, '')           // 기타 태그
                            .replace(timeRegex, '')            // 시간
                            .replace(/-더진국-/g, '')          // -더진국-
                            .replace(/&amp;/g, '&')
                            .replace(/\s+/g, ' ') // 중복 공백 제거
                            .trim();

    // 2. (메뉴명 + 가격) 쌍을 찾는 정규식
    //    (.*? ) : 메뉴명 (Non-greedy)
    //    ([\d,]+원) : 가격 ("6,500원" 또는 "6000원")
    const menuRegex = /(.*?)([\d,]+원)/g;
    let match;
    let foundMatches = false;

    while ((match = menuRegex.exec(singleLine)) !== null) {
      foundMatches = true;
      let name = match[1].trim();
      const priceStr = match[2];
      
      // 3. (11:30~13:50), (한정판매) 등 특정 괄호만 제거
      name = name.replace(/\(\d{2}:\d{2}~\d{2}:\d{2}\)/g, '')
                 .replace(/\(한정판매\)/g, '')
                 .replace(/\[NEW\]/ig, '')
                 .trim();
      
      if (!name) continue; // 가격만 있는 경우 (e.g., " 6500원")

      // 4. '뚝배기' 코너의 '/' 분리 처리
      if (name.includes('/')) {
        const names = name.split('/');
        for (let subName of names) {
          subName = subName.replace(/\[NEW\]/ig, '').trim();
          if (subName) {
            items.push({
              name: [subName],
              price: parseInt(priceStr.replace(/[^\d]/g, ''), 10),
              openAndCloseTime: operatingHours,
            });
          }
        }
      } else {
        // '양식' 코너의 단일 항목 처리
        items.push({
          name: [name],
          price: parseInt(priceStr.replace(/[^\d]/g, ''), 10),
          openAndCloseTime: operatingHours,
        });
      }
    }

    // [Fallback] : 정규식이 실패하고, <br>로 분리된 경우
    // (e.g., "토마토파스타&마늘빵" <br> "6000원")
    if (!foundMatches) {
      for (let i = 0; i < lines.length; i++) {
        let nameLine = lines[i].replace(/<[^>]+>/g, '').replace(timeRegex, '').replace(/-더진국-/g, '').trim();
        if (!nameLine) continue;

        const nextLine = lines[i + 1] || '';
        const nextLinePriceMatch = nextLine.trim().match(/^([\d,]+)원$/);

        if (nextLinePriceMatch) {
          const price = parseInt(nextLinePriceMatch[1].replace(/,/g, ''), 10);
          i++; // 가격 줄 건너뛰기
          
          nameLine = nameLine.replace(/\(.*\)/g, '').replace(/\[NEW\]/ig, '').trim();
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
  
  return { items };
}

/**
 * 2층(일품, 양식, 뚝배기) 테이블 HTML을 파싱합니다.
 * @param tableHtml - 파싱할 <table>의 outerHTML
 * @param date - 이 메뉴가 해당하는 날짜 (요일 계산용)
 */
function parseFloor2Menu(tableHtml: string, date: Date): Meal[] {
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

    // '구분' 헤더 행이거나, 셀이 3개가 아니면 건너뛰기
    if (!headerCell || !lunchCell || !dinnerCell || headerCell.textContent?.trim() === '구분') {
      continue;
    }

    const cornerName = headerCell.textContent?.trim(); // e.g., '일품', '양식'
    if (!cornerName) continue;

    const restaurant = restaurantMapFloor2[cornerName];

    // DTO에 정의된 레스토랑이 아니면('백반' 등) 건너뛰기
    if (!restaurant || !TARGET_RESTAURANTS_FLOOR2.has(restaurant)) {
      continue;
    }

    // 중식 파싱
    const lunchCellHtml = lunchCell.innerHTML.trim();
    if (lunchCellHtml) {
      const { items } = parseMenuCellFloor2(lunchCellHtml);
      if (items.length > 0) {
        allMeals.push({
          restaurant,
          day,
          mealType: 'lunch',
          items,
          status: 'open',
          updatedAt,
        });
      }
    }

    // 석식 파싱 (비어있지만, 혹시 모르니)
    const dinnerCellHtml = dinnerCell.innerHTML.trim();
    if (dinnerCellHtml) {
      const { items } = parseMenuCellFloor2(dinnerCellHtml);
      if (items.length > 0) {
        allMeals.push({
          restaurant,
          day,
          mealType: 'dinner',
          items,
          status: 'open',
          updatedAt,
        });
      }
    }
  }

  return allMeals;
}

/**
 * sday 타임스탬프를 기반으로 동국대 생협 2층(code=1) 모바일 메뉴를 크롤링합니다.
 * @param sday - 대상 날짜의 UTC 자정 Unix
타임스탬프 (초 단위)
 */
export async function crawlDguCoopFloor2(sday: number): Promise<Meal[]> {
  const BASE_URL = 'https://dgucoop.dongguk.edu/mobile/menu.html';
  const RESTAURANT_CODE = 1; // 2층 식당
  const url = `${BASE_URL}?code=${RESTAURANT_CODE}&sday=${sday}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const outputDir = path.join(__dirname, 'debug_output');
    await fs.mkdir(outputDir, { recursive: true });

    // EUC-KR 변환 없이 res.text() 사용
    const html = await res.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // 2층 식당 테이블 선택자 (1층과 동일한 'li > table' 사용)
    const selector = 'li > table';
    const tableNode = document.querySelector<HTMLTableElement>(selector);

    if (!tableNode) {
      throw new Error(`크롤링 실패: 2층 식당 테이블을 찾을 수 없습니다. (Selector: ${selector})`);
    }

    // 3. 파서 실행
    const date = new Date(sday * 1000); 
    const menuData = parseFloor2Menu(tableNode.outerHTML, date);
    
    // --- (디버깅용 파일 저장) ---
    await fs.writeFile(path.join(outputDir, 'fetched_table_floor2.html'), tableNode.outerHTML);
    console.log(`[${date.toLocaleDateString()}] 2층 식당 메뉴(${menuData.length}개) 파싱 성공.`);
    await fs.writeFile(path.join(outputDir, 'parsed_menu_floor2.json'), JSON.stringify(menuData, null, 2));
    console.log('Parsed JSON data saved to debug_output/parsed_menu_floor2.json');
    // ----------------------------

    return menuData;

  } catch (error) {
    console.error('크롤링 중 오류 발생:', error);
    return [];
  }
}

