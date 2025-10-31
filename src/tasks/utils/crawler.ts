import { JSDOM } from 'jsdom';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Meal } from '../../types/meal';
import { DGU_COOP_URL } from '../../constants';

// `import.meta.url`을 사용하기 위해 fileURLToPath가 필요합니다.
// 이 유틸리티 함수는 dgucoop 폴더 내의 파일에서 호출될 것이므로,
// __dirname 계산 시 '../'를 추가하여 'tasks' 폴더를 기준으로 경로를 잡습니다.
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(path.join(__filename, '../'));

/**
 * 동국대 생협 웹사이트에서 메뉴 HTML을 가져와 파싱하는 공통 함수
 * @param floor - 식당 층 (1, 2, 3)
 * @param sday - 대상 날짜의 UTC 자정 Unix 타임스탬프 (초 단위)
 * @param menuParser - 가져온 <table> HTML 문자열과 Date 객체를 받아 Meal[]을 반환하는 파서 함수
 * @returns 파싱된 Meal 객체 배열
 */
export async function fetchAndParse(
  floor: 1 | 2 | 3,
  sday: number,
  menuParser: (tableHtml: string, date: Date) => Meal[],
): Promise<Meal[]> {
  const baseUrl = DGU_COOP_URL[`FLOOR_${floor}`];
  const url = `${baseUrl}&sday=${sday}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const html = await res.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // 공통 테이블 선택자
    const selector = 'li > table';
    const tableNode = document.querySelector<HTMLTableElement>(selector);

    if (!tableNode) {
      throw new Error(
        `크롤링 실패: ${floor}층 식당 테이블을 찾을 수 없습니다. (Selector: ${selector})`,
      );
    }

    const date = new Date(sday * 1000);
    const menuData = menuParser(tableNode.outerHTML, date);

    // --- 디버깅용 파일 저장 ---
    const outputDir = path.join(__dirname, 'dgucoop/debug_output');
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(
      path.join(outputDir, `fetched_table_floor${floor}.html`),
      tableNode.outerHTML,
    );
    console.log(`Target HTML table saved to debug_output/fetched_table_floor${floor}.html`);

    await fs.writeFile(
      path.join(outputDir, `parsed_menu_floor${floor}.json`),
      JSON.stringify(menuData, null, 2),
    );
    console.log(
      `[${date.toLocaleDateString()}] ${floor}층 식당 메뉴(${menuData.length}개) 파싱 성공.`,
    );
    console.log(`Parsed JSON data saved to debug_output/parsed_menu_floor${floor}.json`);
    // ----------------------------

    return menuData;
  } catch (error) {
    console.error(`[${floor}층] 크롤링 중 오류 발생:`, error);
    return [];
  }
}
