import { GoogleGenAI, Type } from "@google/genai";
import { Restaurant, MenuItem, Meal } from "../types/meal";

const ai = new GoogleGenAI({});


export async function ocrImage(url: string) {
  // 이미지 다운로드
  const res = await fetch(url)
  const blob = await res.arrayBuffer()

  // Gemini API 요청
  const ocrRes = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: '',
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            restaurant: {
              type: Type.STRING,
              enum: [
                 '상록원3층식당 - 집밥',
                 '상록원3층식당 - 한그릇(한정판매)',
                 '상록원2층식당 - 일품코너',
                 '상록원2층식당 - 양식코너',
                 '상록원2층식당 - 뚝배기코너',
                 '솥앤누들',
                 '분식당',
                 '누리터식당',
                 '남산학사 기숙사 식당',
                 '경영관 D-flex'
              ] as Restaurant[],
            },
            day: {
              type: Type.STRING,
              enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as Meal['day'][],
            },
            mealType: {
              type: Type.STRING,
              enum: ['breakfast', 'lunch', 'dinner'] as Meal['mealType'][],
            },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: {
                    type: Type.STRING,
                  },
                  price: {
                    type: Type.NUMBER,
                  },
                  description: {
                    type: Type.STRING,
                  },
                },
              },
            },
          },
        },
      },
    }
  })
  const json = await ocrRes.text;
  return json;
}
