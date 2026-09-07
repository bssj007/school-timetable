import React from "react";
import { Link } from "wouter";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased selection:bg-slate-200">
      <div className="max-w-3xl mx-auto px-5 py-10 sm:py-16">
        {/* 상단 네비게이션 — 미니멀 텍스트 링크 */}
        <nav className="mb-10 pb-4 border-b border-slate-200">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 underline underline-offset-4 transition-colors"
          >
            ← 메인 서비스로 돌아가기
          </Link>
        </nav>

        {/* 문서 헤더 */}
        <header className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-2">
            개인정보처리방침
          </h1>
          <p className="text-sm text-slate-500">
            부산성지고등학교 시간표 및 수행평가 공유 서비스
          </p>
          <p className="text-xs text-slate-400 mt-1">
            최종 개정일: 2026년 9월 7일 | 시행일: 2026년 9월 7일
          </p>
        </header>

        {/* 본문 — 순수 텍스트 문서 */}
        <article className="space-y-8 text-[15px] sm:text-base leading-relaxed text-slate-800">
          <section>
            <p className="text-slate-700 leading-relaxed">
              부산성지고등학교 시간표 및 수행평가 공유 서비스(이하 '서비스')는 정보주체의 자유와 권리 보호를 위해 「개인정보 보호법」 및 관계 법령이 정한 바를 준수하며, 이용자의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이 개인정보처리방침을 수립·공개합니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              제1조 (개인정보의 처리 목적)
            </h2>
            <p className="text-slate-700">
              서비스는 다음의 목적을 위하여 최소한의 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 「개인정보 보호법」 제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-700">
              <li>성지고등학교 학생 및 교사의 학급별 시간표 조회 및 맞춤형 학사일정 제공</li>
              <li>당일형 및 과제형 수행평가 일정의 등록, 조회, 수정 및 알림 공유</li>
              <li>학급별 선택과목 이동수업 편성 확인 및 조회 편의 제공</li>
              <li>비정상적 접근 차단, 오류 신고 접수 및 서비스 안정성 유지</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              제2조 (처리하는 개인정보의 항목)
            </h2>
            <p className="text-slate-700">
              서비스는 학사 일정 및 시간표 편의 제공을 위해 다음과 같은 개인정보 항목을 처리하고 있습니다.
            </p>
            <div className="space-y-2 text-slate-700 pl-1">
              <div>
                <strong className="text-slate-900 font-semibold">1. 학생 이용자</strong>
                <p className="text-sm text-slate-600 mt-0.5">
                  - 수집 항목: 학년, 반, 번호(학번), 성명, 선택과목 수강 정보<br />
                  - 수집 방법: 초기 접속 시 사용자 직접 입력 및 브라우저 로컬 저장소 저장
                </p>
              </div>
              <div>
                <strong className="text-slate-900 font-semibold">2. 교사 이용자</strong>
                <p className="text-sm text-slate-600 mt-0.5">
                  - 수집 항목: 교사 성명, 담당 학급 및 교과목, 계정 접속 비밀번호(단방향 암호화)<br />
                  - 수집 방법: 학교 배포 시간표 연동 및 교사 직접 입력
                </p>
              </div>
              <div>
                <strong className="text-slate-900 font-semibold">3. 서비스 이용 과정에서 자동 생성·수집되는 항목</strong>
                <p className="text-sm text-slate-600 mt-0.5">
                  - 수집 항목: 접속 IP 주소, 브라우저 환경 정보(User-Agent), 접속 일시, 서비스 오류 로그, 세션 및 로컬 설정 쿠키<br />
                  - 수집 목적: 비인가 접근 방지, 크로스 브라우징 화면 비율 최적화 및 안정적 서비스 운영
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              제3조 (개인정보의 처리 및 보유 기간)
            </h2>
            <p className="text-slate-700">
              1. 서비스는 법령에 따른 개인정보 보유·이용 기간 또는 정보주체로부터 개인정보를 수집 시에 동의받은 개인정보 보유·이용 기간 내에서 개인정보를 처리·보유합니다.
            </p>
            <p className="text-slate-700">
              2. 각 개인정보의 처리 및 보유 기간은 다음과 같습니다.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-700">
              <li>학생 및 교사 설정 정보: 해당 학년도(학기) 종료 시점 또는 이용자가 브라우저 데이터(쿠키 및 로컬스토리지)를 삭제할 때까지</li>
              <li>수행평가 등록 데이터: 해당 학년도 학사일정 종료 시까지</li>
              <li>접속 및 시스템 로그 기록: 서비스 안정성 확보 및 보안 모니터링을 위해 최대 1년간 보관 후 파기</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              제4조 (개인정보의 제3자 제공)
            </h2>
            <p className="text-slate-700">
              서비스는 이용자의 개인정보를 제1조(개인정보의 처리 목적)에서 명시한 범위 내에서만 처리하며, 이용자의 사전 동의 없이는 본래의 범위를 초과하여 처리하거나 제3자에게 제공하지 않습니다. 다만, 법률의 특별한 규정 등 「개인정보 보호법」 제17조 및 제18조에 해당하는 경우에 한하여 제공할 수 있습니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              제5조 (개인정보처리의 위탁)
            </h2>
            <p className="text-slate-700">
              서비스는 원활하고 안전한 인프라 제공을 위하여 다음과 같이 개인정보 처리업무를 위탁하고 있습니다.
            </p>
            <div className="border border-slate-200 p-3 text-sm text-slate-700 space-y-1 bg-slate-50">
              <p><strong className="text-slate-900">수탁업체:</strong> Cloudflare, Inc.</p>
              <p><strong className="text-slate-900">위탁 업무 내용:</strong> 웹 호스팅 인프라 제공, 분산 데이터베이스(D1) 호스팅 및 디도스(DDoS) 보안 방어</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              제6조 (정보주체와 법정대리인의 권리·의무 및 행사방법)
            </h2>
            <p className="text-slate-700">
              1. 정보주체는 서비스에 대해 언제든지 개인정보 열람·정정·삭제·처리정지 요구 등의 권리를 행사할 수 있습니다.
            </p>
            <p className="text-slate-700">
              2. 학생 이용자는 브라우저 내 '학번/이름 변경' 기능을 통하여 언제든지 본인의 정보를 직접 수정하거나 브라우저 저장소를 초기화하여 삭제할 수 있습니다.
            </p>
            <p className="text-slate-700">
              3. 만 14세 미만 아동의 경우, 법정대리인이 아동의 개인정보에 대한 열람, 정정, 삭제, 처리정지를 요구할 수 있습니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              제7조 (개인정보의 파기절차 및 방법)
            </h2>
            <p className="text-slate-700">
              1. 서비스는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체 없이 해당 개인정보를 파기합니다.
            </p>
            <p className="text-slate-700">
              2. 전자적 파일 형태로 기록·저장된 개인정보는 기록을 재생할 수 없도록 기술적 방법(데이터베이스 레코드 영구 삭제)을 사용하여 파기합니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              제8조 (개인정보의 안전성 확보 조치)
            </h2>
            <p className="text-slate-700">
              서비스는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-700">
              <li>전송 구간 암호화: 웹사이트의 모든 데이터 전송은 HTTPS(TLS) 보안 프로토콜을 통하여 암호화됩니다.</li>
              <li>비밀번호 암호화: 교사 계정 비밀번호는 복호화가 불가능한 일방향 해시 함수로 암호화되어 저장 및 관리됩니다.</li>
              <li>접근 제한 및 통제: 시스템 관리자 페이지에 대한 IP 화이트리스트 및 권한 제어를 적용하여 비인가 접근을 차단합니다.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              제9조 (개인정보 자동 수집 장치의 설치·운영 및 거부)
            </h2>
            <p className="text-slate-700">
              1. 서비스는 이용자에게 개별적인 맞춤서비스를 제공하기 위해 이용정보를 저장하고 수시로 불러오는 '쿠키(Cookie)' 및 '로컬스토리지(localStorage)'를 사용합니다.
            </p>
            <p className="text-slate-700">
              2. 사용 목적: 사용자의 학번·이름 유지, 선택한 교사 시간표 뷰 유지, 다크모드/라이트모드 설정 기억 등 재접속 시의 이용 편의 제공.
            </p>
            <p className="text-slate-700">
              3. 거부 방법: 이용자는 웹 브라우저 옵션 설정을 통해 쿠키 허용 수준을 설정하거나 쿠키 저장을 거부할 수 있습니다. 단, 쿠키 및 로컬스토리지 저장을 거부할 경우 학번 자동 로그인 등 일부 맞춤형 기능의 이용에 어려움이 있을 수 있습니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              제10조 (개인정보 보호책임자 및 담당자 연락처)
            </h2>
            <p className="text-slate-700">
              서비스는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 담당 부서를 지정·운영하고 있습니다.
            </p>
            <div className="border border-slate-200 p-3 text-sm text-slate-700 space-y-1 bg-slate-50">
              <p><strong className="text-slate-900">운영 주체:</strong> 부산성지고등학교 시간표·수행평가 공유 서비스 관리팀</p>
              <p><strong className="text-slate-900">문의 및 고충 처리:</strong> 서비스 메인 화면 및 각 페이지 내 「오류신고」 메뉴 이용</p>
              <p><strong className="text-slate-900">기타 문의:</strong> 서비스 내 관리사무소 창구</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-1.5">
              제11조 (개인정보 처리방침의 변경)
            </h2>
            <p className="text-slate-700">
              이 개인정보처리방침은 2026년 9월 7일부터 적용되며, 법령 및 방침에 따른 변경내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 공지사항 또는 서비스 화면을 통하여 고지할 것입니다.
            </p>
          </section>
        </article>

        {/* 문서 푸터 */}
        <footer className="mt-16 pt-6 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <p>© 2026 부산성지고등학교 시간표 서비스. All rights reserved.</p>
          <Link href="/" className="hover:text-slate-800 underline underline-offset-2">
            메인 페이지로 이동
          </Link>
        </footer>
      </div>
    </div>
  );
}
