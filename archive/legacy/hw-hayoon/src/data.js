// Demonstration orders from origin/디벨롭_hy:carrier-app/data/factories.js.
// Route estimates from janjaemi-app/assets/carrier/orders.json; no live traffic.
// Only the 11 example calls are included, not the source factory database.
// Region-level addresses identify example stops, not verified street addresses.
export const ORDERS = [
  {
    "id": 1,
    "from": "구미 공단동",
    "to": "칠곡 약목",
    "shipper": "공장 #175101",
    "consignee": "공장 #185962",
    "stops": [
      [
        36.1169,
        128.37517
      ],
      [
        36.04442,
        128.34545
      ]
    ],
    "fare": 71000,
    "base": 56000,
    "premium": 10000,
    "wait": 5000,
    "item": "폐합성수지 PP",
    "bags": 18,
    "ton": 3.2,
    "when": "오늘 14:00 당상",
    "grade": "A",
    "tags": [
      "일반 독차",
      "인계서 확인"
    ],
    "pay": "익일 정산",
    "rating": 4.8,
    "cond": "지게차 있음",
    "window": "14:00 ~ 16:00 상차",
    "dropNote": "18:00까지 하차 · 계량대 있음",
    "emptyKm": 3.676,
    "loadedKm": 9.41,
    "estimatedMin": 15,
    "emptyMin": 7,
    "category": "독차",
    "recommended": true,
    "urgent": false,
    "departLabel": "14:00",
    "material": "PP",
    "fromAddress": "구미 공단동 · 공장 #175101",
    "toAddress": "칠곡 약목 · 공장 #185962",
    "distanceLabel": "예상 거리",
    "timeLabel": "예상 소요"
  },
  {
    "id": 2,
    "from": "구미 구포동",
    "to": "칠곡 가산",
    "shipper": "공장 #176334",
    "consignee": "공장 #185915",
    "stops": [
      [
        36.13121,
        128.41449
      ],
      [
        36.09233,
        128.40387
      ],
      [
        36.10091,
        128.53059
      ]
    ],
    "fare": 119000,
    "base": 88000,
    "premium": 15000,
    "wait": 16000,
    "item": "고철",
    "bags": 26,
    "ton": 4.6,
    "when": "내일 09:00 내착",
    "grade": "A",
    "tags": [
      "묶음 2곳",
      "인계서 확인"
    ],
    "pay": "지급일 확정",
    "rating": 4.6,
    "cond": "지게차 있음",
    "window": "07:00 ~ 08:30 상차",
    "dropNote": "09:00까지 하차",
    "via": "구미 시미동 경유",
    "emptyKm": 6.743,
    "loadedKm": 20.796,
    "estimatedMin": 32,
    "emptyMin": 10,
    "category": "묶음",
    "recommended": true,
    "urgent": false,
    "departLabel": "07:00",
    "material": "고철",
    "fromAddress": "구미 구포동 · 공장 #176334",
    "toAddress": "칠곡 가산 · 공장 #185915",
    "distanceLabel": "예상 거리",
    "timeLabel": "예상 소요"
  },
  {
    "id": 3,
    "from": "구미 임수동",
    "to": "구미 고아",
    "shipper": "공장 #176222",
    "consignee": "공장 #176550",
    "stops": [
      [
        36.1096,
        128.4158
      ],
      [
        36.21794,
        128.3258
      ]
    ],
    "fare": 97000,
    "base": 89000,
    "premium": 3000,
    "wait": 5000,
    "item": "폐지 골판지",
    "bags": 10,
    "ton": 1.1,
    "when": "오늘 16:30 당상",
    "grade": "B",
    "tags": [
      "혼적"
    ],
    "pay": "익일 정산",
    "rating": 4.3,
    "cond": "수작업 상차",
    "window": "16:30 ~ 17:30 상차",
    "dropNote": "19:00까지 하차",
    "emptyKm": 4.02,
    "loadedKm": 20.971,
    "estimatedMin": 26,
    "emptyMin": 8,
    "category": "혼적",
    "recommended": false,
    "urgent": false,
    "departLabel": "16:30",
    "material": "골판지",
    "fromAddress": "구미 임수동 · 공장 #176222",
    "toAddress": "구미 고아 · 공장 #176550",
    "distanceLabel": "예상 거리",
    "timeLabel": "예상 소요"
  },
  {
    "id": 4,
    "from": "구미 산동",
    "to": "김천 아포",
    "shipper": "공장 #176995",
    "consignee": "공장 #173558",
    "stops": [
      [
        36.14281,
        128.44831
      ],
      [
        36.16728,
        128.2543
      ]
    ],
    "fare": 113000,
    "base": 93000,
    "premium": 10000,
    "wait": 10000,
    "item": "비철 알루미늄",
    "bags": 14,
    "ton": 2.4,
    "when": "11.06 (금) 10:00",
    "grade": "A",
    "tags": [
      "정기 운반",
      "인계서 확인"
    ],
    "pay": "월 4회 고정",
    "rating": 4.9,
    "cond": "지게차 있음",
    "window": "10:00 ~ 11:00 상차",
    "dropNote": "15:00까지 하차",
    "emptyKm": 10.765,
    "loadedKm": 22.375,
    "estimatedMin": 32,
    "emptyMin": 17,
    "category": "정기",
    "recommended": true,
    "urgent": false,
    "departLabel": "10:00",
    "material": "알루미늄",
    "fromAddress": "구미 산동 · 공장 #176995",
    "toAddress": "김천 아포 · 공장 #173558",
    "distanceLabel": "예상 거리",
    "timeLabel": "예상 소요"
  },
  {
    "id": 5,
    "from": "구미 금전동",
    "to": "칠곡 석적",
    "shipper": "공장 #176409",
    "consignee": "공장 #185433",
    "stops": [
      [
        36.13196,
        128.45539
      ],
      [
        36.08071,
        128.40928
      ]
    ],
    "fare": 65000,
    "base": 61000,
    "premium": 0,
    "wait": 4000,
    "item": "폐비닐 압축",
    "bags": 8,
    "ton": 0.9,
    "when": "오늘 17:00 당상",
    "grade": "C",
    "tags": [
      "소량"
    ],
    "pay": "익일 정산",
    "rating": 4.1,
    "cond": "수작업 상차",
    "window": "17:00 ~ 18:00 상차",
    "dropNote": "20:00까지 하차",
    "emptyKm": 10.782,
    "loadedKm": 10.993,
    "estimatedMin": 15,
    "emptyMin": 17,
    "category": "소량",
    "recommended": false,
    "urgent": false,
    "departLabel": "17:00",
    "material": "비닐",
    "fromAddress": "구미 금전동 · 공장 #176409",
    "toAddress": "칠곡 석적 · 공장 #185433",
    "distanceLabel": "예상 거리",
    "timeLabel": "예상 소요"
  },
  {
    "id": 6,
    "from": "구미 공단동",
    "to": "대구 달서",
    "shipper": "공장 #175101",
    "consignee": "공장 #41931",
    "stops": [
      [
        36.1169,
        128.37517
      ],
      [
        35.83353,
        128.49064
      ]
    ],
    "fare": 184000,
    "base": 154000,
    "premium": 25000,
    "wait": 5000,
    "item": "폐합성수지 PE",
    "bags": 12,
    "ton": 2.1,
    "when": "오늘 13:00 급송",
    "grade": "A",
    "tags": [
      "당일 급송",
      "인계서 확인"
    ],
    "pay": "당일 정산",
    "rating": 4.7,
    "cond": "지게차 있음",
    "window": "지금 ~ 13:00 상차",
    "dropNote": "16:00까지 하차",
    "emptyKm": 3.676,
    "loadedKm": 44.238,
    "estimatedMin": 39,
    "emptyMin": 7,
    "category": "급송",
    "recommended": true,
    "urgent": true,
    "departLabel": "지금",
    "material": "PE",
    "fromAddress": "구미 공단동 · 공장 #175101",
    "toAddress": "대구 달서 · 공장 #41931",
    "distanceLabel": "예상 거리",
    "timeLabel": "예상 소요"
  },
  {
    "id": 7,
    "from": "구미 임수동",
    "to": "경남 창원",
    "shipper": "공장 #176222",
    "consignee": "공장 #188617",
    "stops": [
      [
        36.1096,
        128.4158
      ],
      [
        35.20802,
        128.65729
      ]
    ],
    "fare": 288000,
    "base": 258000,
    "premium": 20000,
    "wait": 10000,
    "item": "고철 스크랩",
    "bags": 22,
    "ton": 4.2,
    "when": "내일 08:00 당상",
    "grade": "A",
    "tags": [
      "장거리",
      "인계서 확인"
    ],
    "pay": "지급일 확정",
    "rating": 4.5,
    "cond": "지게차 있음",
    "window": "08:00 ~ 09:00 상차",
    "dropNote": "내일 15:00까지 하차",
    "emptyKm": 4.02,
    "loadedKm": 131.996,
    "estimatedMin": 118,
    "emptyMin": 8,
    "category": "장거리",
    "recommended": false,
    "urgent": false,
    "departLabel": "08:00",
    "material": "고철",
    "fromAddress": "구미 임수동 · 공장 #176222",
    "toAddress": "경남 창원 · 공장 #188617",
    "distanceLabel": "예상 거리",
    "timeLabel": "예상 소요"
  },
  {
    "id": 8,
    "from": "구미 구포동",
    "to": "충북 청주",
    "shipper": "공장 #176334",
    "consignee": "공장 #149089",
    "stops": [
      [
        36.13121,
        128.41449
      ],
      [
        36.69639,
        127.36591
      ]
    ],
    "fare": 305000,
    "base": 270000,
    "premium": 30000,
    "wait": 5000,
    "item": "폐전선 피복",
    "bags": 16,
    "ton": 2.8,
    "when": "오늘 22:00 당상",
    "grade": "B",
    "tags": [
      "야간 운행",
      "심야 할증"
    ],
    "pay": "익일 정산",
    "rating": 4.4,
    "cond": "수작업 상차",
    "window": "22:00 ~ 23:00 상차",
    "dropNote": "내일 06:00까지 하차",
    "emptyKm": 6.743,
    "loadedKm": 140.036,
    "estimatedMin": 128,
    "emptyMin": 10,
    "category": "야간",
    "recommended": false,
    "urgent": false,
    "departLabel": "22:00",
    "material": "전선 피복",
    "fromAddress": "구미 구포동 · 공장 #176334",
    "toAddress": "충북 청주 · 공장 #149089",
    "distanceLabel": "예상 거리",
    "timeLabel": "예상 소요"
  },
  {
    "id": 9,
    "from": "대구 달성",
    "to": "구미 시미동",
    "shipper": "공장 #43823",
    "consignee": "공장 #176137",
    "stops": [
      [
        35.73494,
        128.45655
      ],
      [
        36.09233,
        128.40387
      ]
    ],
    "fare": 156000,
    "base": 146000,
    "premium": 5000,
    "wait": 5000,
    "item": "비철 동 스크랩",
    "bags": 9,
    "ton": 1.6,
    "when": "오늘 17:00 당상",
    "grade": "A",
    "tags": [
      "귀로 콜",
      "복귀 길 추천"
    ],
    "pay": "익일 정산",
    "rating": 4.8,
    "cond": "지게차 있음",
    "window": "17:00 ~ 18:00 상차",
    "dropNote": "20:00까지 하차",
    "emptyKm": 57.421,
    "loadedKm": 57.042,
    "estimatedMin": 51,
    "emptyMin": 52,
    "category": "귀로",
    "recommended": false,
    "urgent": false,
    "departLabel": "17:00",
    "material": "동",
    "fromAddress": "대구 달성 · 공장 #43823",
    "toAddress": "구미 시미동 · 공장 #176137",
    "distanceLabel": "예상 거리",
    "timeLabel": "예상 소요"
  },
  {
    "id": 10,
    "from": "구미 공단동",
    "to": "포항 왕복",
    "shipper": "공장 #175101",
    "consignee": "공장 #174578",
    "stops": [
      [
        36.1169,
        128.37517
      ],
      [
        35.94969,
        129.38679
      ],
      [
        36.11946,
        128.38026
      ]
    ],
    "fare": 485000,
    "base": 460000,
    "premium": 15000,
    "wait": 10000,
    "item": "폐합성수지 / 철 스크랩",
    "bags": 20,
    "ton": 3.8,
    "when": "내일 07:00 당상",
    "grade": "A",
    "tags": [
      "왕복",
      "양방향 운임"
    ],
    "pay": "지급일 확정",
    "rating": 4.6,
    "cond": "지게차 있음",
    "window": "07:00 ~ 08:00 상차",
    "dropNote": "내일 18:00까지 복귀",
    "via": "포항 경유",
    "viaNote": "하차 후 재상차",
    "dropLabel": "구미 공단동",
    "emptyKm": 3.676,
    "loadedKm": 266.681,
    "estimatedMin": 215,
    "emptyMin": 7,
    "category": "왕복",
    "recommended": false,
    "urgent": false,
    "departLabel": "07:00",
    "material": "합성수지 · 철",
    "fromAddress": "구미 공단동 · 공장 #175101",
    "toAddress": "구미 공단동 · 공장 #174578",
    "distanceLabel": "예상 거리",
    "timeLabel": "예상 소요"
  },
  {
    "id": 11,
    "from": "구미 공단동",
    "to": "경기 평택",
    "shipper": "공장 #175101",
    "consignee": "공장 #79212",
    "stops": [
      [
        36.1169,
        128.37517
      ],
      [
        36.968,
        126.84975
      ]
    ],
    "fare": 420000,
    "base": 370000,
    "premium": 40000,
    "wait": 10000,
    "item": "압축 폐지 베일",
    "bags": 40,
    "ton": 7.5,
    "when": "11.06 (금) 09:00",
    "grade": "A",
    "tags": [
      "대형 전용",
      "11톤 이상"
    ],
    "pay": "지급일 확정",
    "rating": 4.5,
    "cond": "지게차 있음",
    "window": "09:00 ~ 10:00 상차",
    "dropNote": "11.06 (금) 16:00까지 하차",
    "emptyKm": 3.676,
    "loadedKm": 206.401,
    "estimatedMin": 166,
    "emptyMin": 7,
    "category": "대형",
    "recommended": false,
    "urgent": false,
    "departLabel": "09:00",
    "material": "폐지",
    "fromAddress": "구미 공단동 · 공장 #175101",
    "toAddress": "경기 평택 · 공장 #79212",
    "distanceLabel": "예상 거리",
    "timeLabel": "예상 소요"
  }
];

export const DRIVER = {
  "name": "하윤",
  "company": "하윤운송",
  "vehicle": "5톤 윙바디",
  "plate": "경북 89바 1234",
  "capacityTon": 5,
  "height": 3.6,
  "grossWeight": 12,
  "phone": "010-0000-1234",
  "rating": 4.9,
  "completed": 128
};

// Historical settlement examples are separate trips from currently open calls.
export const LEDGER = [
  {
    "id": "seed-1",
    "from": "구미 공단",
    "to": "칠곡 약목",
    "date": "2026-11-03",
    "fare": 97000,
    "status": "pending",
    "category": "독차",
    "orderId": 1
  },
  {
    "id": "seed-2",
    "from": "구미 구포",
    "to": "칠곡 가산",
    "date": "2026-11-03",
    "fare": 87000,
    "status": "pending",
    "category": "묶음",
    "orderId": 2
  },
  {
    "id": "seed-3",
    "from": "구미 임수",
    "to": "구미 고아",
    "date": "2026-11-02",
    "fare": 58000,
    "status": "pending",
    "category": "독차",
    "orderId": 3
  },
  {
    "id": "seed-4",
    "from": "구미 산동",
    "to": "김천 아포",
    "date": "2026-10-31",
    "fare": 112000,
    "status": "pending",
    "category": "독차",
    "orderId": 4
  },
  {
    "id": "seed-5",
    "from": "구미 시미",
    "to": "칠곡 석적",
    "date": "2026-10-30",
    "fare": 46000,
    "status": "paid",
    "category": "독차",
    "orderId": 5
  },
  {
    "id": "seed-6",
    "from": "구미 공단",
    "to": "칠곡 북삼",
    "date": "2026-10-29",
    "fare": 124000,
    "status": "paid",
    "category": "묶음",
    "orderId": 6
  },
  {
    "id": "seed-7",
    "from": "구미 금전",
    "to": "칠곡 약목",
    "date": "2026-10-28",
    "fare": 88000,
    "status": "paid",
    "category": "묶음",
    "orderId": 7
  }
];

export const WEEK = [
  {
    "label": "수",
    "value": 88000
  },
  {
    "label": "목",
    "value": 124000
  },
  {
    "label": "금",
    "value": 46000
  },
  {
    "label": "토",
    "value": 112000
  },
  {
    "label": "일",
    "value": 0
  },
  {
    "label": "월",
    "value": 58000
  },
  {
    "label": "화",
    "value": 184000
  }
];
