# ⑧ 대화 도우미 (assistant)

## 역할
앱 대화 질문 한 개에서 주제(price, order, law, grade, howto)를 찾고, 주제별 근거 항목(주장)을 데이터에서 만든다. 질문 한 번에 답 한 번이며 대화 기록은 받지 않는다.

## 입력
ctx.question(앞뒤 공백을 뺀 1~300자), ctx.role, ctx.orders(요청한 회사 자신의 주문: id, 상태 한글, 폐기물 이름, 무게만. 상대 회사 이름은 받지 않는다)

## 출력
주장: price(prices.json 최근값과 기준일, 그 품목의 조사 기준), order(주문 건수, 상태별 수, 최근 3건), law(law_articles.json에서 낱말이 많이 맞는 조문 최대 3개), grade(harness.yaml 등급 기준과 팀 가정 표시, 사진은 등급 계산에 쓰지 않음), howto(역할별 앱 사용 순서). data.claim_topics는 주장마다의 주제. 주제가 price, grade뿐이면 ctx.skip_llm_summary를 켜서 지휘 AI가 LLM 요약을 부르지 않는다.

## 도구
calc.alias_map, price_item_for, latest_price(재질 별칭과 시세 품목), data/law_articles.json, harness.yaml(grade_thresholds).

## LLM이 하는 일
낱말로 주제를 못 찾았을 때만, 가려진 질문을 보고 주제를 하나 고른다(스키마 enum: price, order, law, grade, howto, none). enum 밖의 값은 무시한다. 답 문장은 주제가 order, howto뿐일 때만 지휘 AI가 근거 항목만으로 쓴다. price, grade, law가 있으면 코드 문장만 보여 준다.

## 하지 않는 일
쓰기 기능이 없다. 다른 회사 자료를 근거로 쓰지 않는다. 시세, 등급 문장은 LLM이 쓰지 않는다. 근거가 없는 질문에는 값을 지어내지 않는다. 질문 원문을 주장, 결과에 남기지 않는다.
