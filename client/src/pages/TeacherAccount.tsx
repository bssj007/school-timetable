import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { getTeacherNameCookie } from "@/components/RoleSelectDialog";
import { useUserConfig } from "@/contexts/UserConfigContext";

// 비영어(한글 등 조합 문자) 제거 필터
// type="text" + WebkitTextSecurity 방식 사용 시에도 IME 확정 후 한글이 남을 수 있으므로
// onChange 에서 직접 제거한다
function stripKorean(val: string): string {
  return val.replace(/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\uFFA0-\uFFDC]/g, "");
}

export default function TeacherAccount() {
  const [, setLocation] = useLocation();
  const { teacherName: ctxTeacherName } = useUserConfig();

  const [teacherName, setTeacherName] = useState<string>(() => {
    return ctxTeacherName || getTeacherNameCookie() || "";
  });

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // body 배경을 강제로 순수 흰색(#ffffff)으로 리셋
  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    const prevBgImage = document.body.style.backgroundImage;
    const prevBgAttachment = document.body.style.backgroundAttachment;

    document.body.style.backgroundColor = "#ffffff";
    document.body.style.backgroundImage = "none";
    document.body.style.backgroundAttachment = "initial";

    return () => {
      document.body.style.backgroundColor = prevBg;
      document.body.style.backgroundImage = prevBgImage;
      document.body.style.backgroundAttachment = prevBgAttachment;
    };
  }, []);

  useEffect(() => {
    if (!teacherName) {
      const storedId = localStorage.getItem("teacher-page-selected-teacher");
      if (storedId) {
        fetch("/api/comcigan?type=teacher_timetable")
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.teachers && data.teachers[parseInt(storedId, 10)]) {
              const name = data.teachers[parseInt(storedId, 10)].replace(/\*$/, "");
              setTeacherName(name);
            }
          })
          .catch(() => {});
      }
    }
  }, [teacherName]);

  const handleBack = () => {
    setLocation("/teacher");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (!teacherName) {
      setErrorMessage("선생님 계정명을 확인할 수 없습니다.");
      return;
    }

    if (!newPassword.trim()) {
      setErrorMessage("새 비밀번호를 입력해주세요.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.");
      return;
    }

    const confirmed = window.confirm(`"${teacherName}" 선생님의 비밀번호를 변경하시겠습니까?`);
    if (!confirmed) {
      return;
    }

    setIsChanging(true);
    try {
      const res = await fetch("/api/teacher-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teacherName,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "비밀번호 변경 실패");
      }

      setMessage(data.message || "비밀번호가 성공적으로 변경되었습니다.");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
      alert("비밀번호가 성공적으로 변경되었습니다.");
    } catch (err: any) {
      setErrorMessage(err.message || "오류가 발생했습니다.");
      alert(err.message || "오류가 발생했습니다.");
    } finally {
      setIsChanging(false);
    }
  };

  // 비밀번호 입력용 style 헬퍼 — type=text + WebkitTextSecurity 방식으로 한글 IME 우회
  const pwInputStyle = (show: boolean): React.CSSProperties => ({
    WebkitTextSecurity: show ? "none" : "disc",
    fontFamily: "sans-serif",
    fontSize: 14,
    padding: "6px 10px",
    border: "1px solid #ccc",
    borderRadius: 4,
    outline: "none",
    flex: 1,
    boxSizing: "border-box",
  } as React.CSSProperties);

  return (
    <div style={{ backgroundColor: "#ffffff", minHeight: "100vh", padding: "20px", color: "#000000", fontFamily: "sans-serif" }}>
      <div>
        <button
          type="button"
          onClick={handleBack}
          style={{ border: "1px solid #888", borderRadius: 4, padding: "4px 12px", cursor: "pointer", background: "#fff" }}
        >
          돌아가기
        </button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <div>
        <p>
          <strong>계정명: </strong>
          <span>{teacherName ? `${teacherName} 선생님` : "선생님 (미선택)"}</span>
        </p>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {!showPasswordForm ? (
        <div>
          <button
            type="button"
            onClick={() => {
              setShowPasswordForm(true);
              setMessage("");
              setErrorMessage("");
            }}
            style={{ border: "1px solid #888", borderRadius: 4, padding: "4px 12px", cursor: "pointer", background: "#fff" }}
          >
            비밀번호 변경
          </button>
        </div>
      ) : (
        <div>
          <form onSubmit={handleChangePassword}>
            {/* 새 비밀번호 */}
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="new-password" style={{ display: "block", marginBottom: 4 }}>새 비밀번호: </label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  id="new-password"
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(stripKorean(e.target.value))}
                  placeholder="새 비밀번호"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  style={pwInputStyle(showNewPw)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowNewPw(v => !v)}
                  style={{ border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", cursor: "pointer", background: "#f5f5f5", whiteSpace: "nowrap", fontSize: 12 }}
                >
                  {showNewPw ? "숨기기" : "표시"}
                </button>
              </div>
            </div>

            {/* 새 비밀번호 확인 */}
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="confirm-password" style={{ display: "block", marginBottom: 4 }}>새 비밀번호 확인: </label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  id="confirm-password"
                  type="text"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(stripKorean(e.target.value))}
                  placeholder="새 비밀번호 확인"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  style={pwInputStyle(showConfirmPw)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirmPw(v => !v)}
                  style={{ border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", cursor: "pointer", background: "#f5f5f5", whiteSpace: "nowrap", fontSize: 12 }}
                >
                  {showConfirmPw ? "숨기기" : "표시"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="submit"
                disabled={isChanging}
                style={{
                  border: "1px solid #1a56db",
                  borderRadius: 4,
                  padding: "6px 16px",
                  cursor: isChanging ? "not-allowed" : "pointer",
                  background: isChanging ? "#c7d2fe" : "#1a56db",
                  color: "#fff",
                  fontWeight: 600,
                }}
              >
                {isChanging ? "변경 중..." : "확인 (변경 완료)"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordForm(false);
                  setNewPassword("");
                  setConfirmPassword("");
                  setErrorMessage("");
                }}
                style={{
                  border: "1px solid #888",
                  borderRadius: 4,
                  padding: "6px 16px",
                  cursor: "pointer",
                  background: "#fff",
                  color: "#333",
                }}
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {message && (
        <div>
          <br />
          <p style={{ color: "green" }}>{message}</p>
        </div>
      )}

      {errorMessage && (
        <div>
          <br />
          <p style={{ color: "red" }}>{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
