# student_profiles DB 구조 명세

> **최종 수정일:** 2026-03-15  
> **이 문서는 코드 수정 시 반드시 참조해야 합니다.**

## UNIQUE 제약조건

```sql
UNIQUE(grade, classNum, studentNumber)
```

- **dataset은 UNIQUE 제약조건에 포함되지 않습니다.**
- 학생당 **1개 행**만 존재합니다.

## 다중 Dataset Electives 저장 방식

`electives`와 `dataset` 컬럼은 **두 가지 형태**로 저장됩니다:

### 단일 Dataset (레거시 호환)

```
electives: '{"A":{"subject":"직영","teacher":"김선생"}}'   ← JSON 오브젝트
dataset:   'MANUAL_PLAN'                                    ← 일반 문자열
```

### 다중 Dataset (BRIDGE 실행 후)

```
electives: '[{"A":{"subject":"직영"}}, {"A":{"subject":"기하"}}]'   ← JSON 배열
dataset:   '["MANUAL_PLAN","자료147"]'                               ← JSON 배열
```

- `electives[i]`는 `dataset[i]`에 해당합니다 (위치 인덱스 매칭).
- 단일 dataset일 때는 레거시 형태(오브젝트/문자열)로 저장하여 **후방 호환성을 유지**합니다.

## 읽기/쓰기 규칙

### 읽기 (특정 dataset의 electives 가져오기)

```ts
// 1. dataset 컬럼 파싱
const parsed = JSON.parse(row.dataset);
const datasets = Array.isArray(parsed) ? parsed : [row.dataset];

// 2. 인덱스 찾기
const idx = datasets.indexOf(targetDataset);

// 3. electives 배열에서 해당 인덱스 추출
const parsedElectives = JSON.parse(row.electives);
const electives = Array.isArray(parsedElectives) ? parsedElectives[idx] : parsedElectives;
```

### 쓰기 (특정 dataset의 electives 갱신)

1. 기존 행을 `SELECT WHERE grade=? AND classNum=? AND studentNumber=?`로 조회
2. 기존 `dataset`/`electives`를 배열로 정규화
3. 해당 dataset의 인덱스를 찾아 갱신 (없으면 추가)
4. 단일 항목이면 레거시 형태로, 다중이면 배열 형태로 직렬화
5. `UPDATE ... WHERE id = ?`

### ON CONFLICT 사용 시

```sql
ON CONFLICT(grade, classNum, studentNumber)
-- ❌ 절대 사용 금지: ON CONFLICT(grade, classNum, studentNumber, dataset)
```

## ip_profiles / cookie_profiles

- `student_profile_id` (INTEGER FK) → `student_profiles(id) ON DELETE SET NULL`
- 이 변경에 **영향받지 않습니다.** 학생당 행이 1개이므로 FK가 안정적입니다.

## 마이그레이션

배포 후 `/api/admin/migrate_db`를 호출하면:
1. 기존 dataset별 다중 행을 배열 형태 단일 행으로 **자동 병합**
2. ip/cookie profiles의 FK를 새 id로 **재매핑**
3. `UNIQUE(grade, classNum, studentNumber)` 스키마로 테이블 재생성
